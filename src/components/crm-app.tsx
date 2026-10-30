"use client";

import { useEffect, useRef, useState } from "react";
import { CriteriaDialog } from "@/components/criteria-dialog";
import { ResultsWorkspace } from "@/components/results-workspace";
import { RunPanel } from "@/components/run-panel";
import { UploadPanel } from "@/components/upload-panel";
import { BATCH_SETTINGS, CRITERIA_VERSION, SORT_NOTE } from "@/lib/criteria";
import { decodeCsvBytes, parseCrmCsv, recordsFromParsed, type ParsedCsv } from "@/lib/csv";
import { exportJson, exportRows, selectRecords, toCsv } from "@/lib/export";
import { compareRecords } from "@/lib/grade";
import { createJobId } from "@/lib/job-id";
import { applyPendingRuleRows } from "@/lib/empty-row";
import { requestLabelBatch } from "@/lib/label-client";
import { criteriaMatches, prepareForResume } from "@/lib/resume";
import { runLabeling } from "@/lib/run-labeling";
import { clearStoredJob, loadActiveJob, saveJob } from "@/lib/storage";
import { blankCounts, countByStatus, countUniqueCustomers } from "@/lib/summary";
import type { AppConfig, ContactRecord, StoredJob } from "@/lib/types";

const CONFIG_MESSAGE =
  "서버에 GEMINI_API_KEY 또는 GEMINI_MODEL이 설정되어 있지 않습니다. 프로젝트 루트의 .env.local에 넣은 뒤 개발 서버를 다시 시작해 주세요.";

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CrmApp() {
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [job, setJob] = useState<StoredJob | null>(null);
  const [draft, setDraft] = useState<ParsedCsv | null>(null);
  const [draftName, setDraftName] = useState<string | null>(null);
  const [encodingError, setEncodingError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [pauseRequested, setPauseRequested] = useState(false);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [criteriaBlocked, setCriteriaBlocked] = useState(false);
  const [batchSize, setBatchSize] = useState<number>(BATCH_SETTINGS.defaultBatchSize);
  const [notice, setNotice] = useState<string | null>(null);
  const pauseRef = useRef(false);
  const runningRef = useRef(false);
  const jobRef = useRef<StoredJob | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    jobRef.current = job;
  }, [job]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/config");
        if (!response.ok) throw new Error("config");
        const nextConfig = (await response.json()) as AppConfig;
        const stored = await loadActiveJob();
        if (cancelled) return;
        setConfig(nextConfig);
        if (!stored) return;
        if (!criteriaMatches(stored)) {
          setCriteriaBlocked(true);
          return;
        }
        const prepared = prepareForResume(stored);
        if (prepared !== stored) await saveJob(prepared);
        if (!cancelled) setJob(prepared);
      } catch {
        if (!cancelled) setConfigError("서버 설정을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function queueSave(next: StoredJob) {
    saveQueue.current = saveQueue.current.then(() => saveJob(next)).catch(() => undefined);
  }

  function replaceJob(next: StoredJob) {
    jobRef.current = next;
    setJob(next);
    queueSave(next);
  }

  async function onFile(file: File) {
    if (runningRef.current) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setEncodingError("CSV 파일을 선택해 주세요.");
      setDraft(null);
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const decoded = decodeCsvBytes(bytes);
    if (!decoded.ok) {
      setEncodingError(decoded.error);
      setDraft(null);
      setDraftName(file.name);
      return;
    }
    const parsed = parseCrmCsv(decoded.text);
    setEncodingError(null);
    setDraft(parsed);
    setDraftName(file.name);
    setNotice(null);
    if (!parsed.canRun) return;
    const modelId = config?.model ?? "";
    const id = await createJobId(bytes, CRITERIA_VERSION, modelId);
    const existing = jobRef.current;
    if (existing?.id === id) {
      setNotice("같은 파일의 저장된 작업을 유지합니다.");
      return;
    }
    if (existing && existing.records.some((record) => record.status === "완료" || record.status === "실패")) {
      const confirmed = window.confirm("저장된 라벨링 작업을 새 파일로 바꿀까요?");
      if (!confirmed) return;
    }
    const next: StoredJob = {
      id,
      fileName: file.name,
      criteriaVersion: CRITERIA_VERSION,
      modelId,
      columns: parsed.columns,
      records: recordsFromParsed(parsed),
      selectedIds: [],
      phase: "ready",
      haltMessage: null,
      updatedAt: new Date().toISOString(),
    };
    setActiveId(null);
    setCriteriaBlocked(false);
    replaceJob(next);
  }

  const modelMismatch = Boolean(job && config?.model && job.modelId && job.modelId !== config.model);
  const fileBlocked = Boolean(draft && !draft.canRun);
  const hasPending = Boolean(job?.records.some((record) => record.status === "대기"));
  const started = Boolean(job?.records.some((record) => record.status !== "대기"));
  const canStart = Boolean(job && job.records.length > 0 && !started && hasPending && !modelMismatch && !fileBlocked && !running);
  const canResume = Boolean(job && started && hasPending && !modelMismatch && !fileBlocked && !running);

  async function execute(records: ContactRecord[]) {
    const current = jobRef.current;
    if (!current || runningRef.current || modelMismatch) return;
    if (config && !config.configured) {
      const ruled = applyPendingRuleRows(records);
      replaceJob({
        ...current,
        records: ruled,
        phase: "paused",
        haltMessage: CONFIG_MESSAGE,
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    runningRef.current = true;
    pauseRef.current = false;
    setRunning(true);
    setPauseRequested(false);
    await runLabeling({
      records,
      batchSize: clampBatch(batchSize),
      isPaused: () => pauseRef.current,
      fetchBatch: requestLabelBatch,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      onUpdate: (update) => {
        const latest = jobRef.current;
        if (!latest) return;
        replaceJob({
          ...latest,
          records: update.records,
          phase: update.phase,
          haltMessage: update.message,
          updatedAt: new Date().toISOString(),
        });
      },
    });
    runningRef.current = false;
    setRunning(false);
    setPauseRequested(false);
  }

  async function reset() {
    if (runningRef.current) return;
    const confirmed = window.confirm("저장된 업로드와 라벨링 결과를 삭제할까요?");
    if (!confirmed) return;
    await clearStoredJob();
    jobRef.current = null;
    setJob(null);
    setDraft(null);
    setDraftName(null);
    setEncodingError(null);
    setActiveId(null);
    setCriteriaBlocked(false);
    setNotice(null);
  }

  function download(scope: "all" | "selected", format: "csv" | "json") {
    if (!job) return;
    const ordered = [...job.records].sort(compareRecords);
    const rows = scope === "selected" ? selectRecords(ordered, job.selectedIds) : ordered;
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
      downloadText(`crm-label-${scope}-${stamp}.csv`, toCsv(exportRows(rows, job.columns)), "text/csv;charset=utf-8");
      return;
    }
    downloadText(
      `crm-label-${scope}-${stamp}.json`,
      JSON.stringify(exportJson(rows, scope), null, 2),
      "application/json",
    );
  }

  const activeJob = fileBlocked ? null : job;
  const counts = activeJob ? countByStatus(activeJob.records) : null;
  const partial = Boolean(
    activeJob && started && activeJob.records.some((record) => record.status === "대기" || record.status === "처리 중"),
  );
  const step = !activeJob ? 1 : activeJob.records.every((record) => record.status === "완료" || record.status === "실패") && !running ? 3 : 2;
  const analyzed = Boolean(activeJob?.records.some((record) => record.status !== "대기"));

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">아크릴 전시회 CRM</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">CRM 맞춤 제안 대상 분석</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            접점 메모에서 관심, 업무 요구, 후속 요청을 읽어 맞춤 제안을 준비할 대상을 검토합니다. 구매 확률은 계산하지 않습니다.
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => void reset()} disabled={running || !ready}>
          초기화
        </button>
      </header>

      <ol className="mt-6 grid gap-2 text-sm sm:grid-cols-3" aria-label="진행 단계">
        {["파일 업로드", "AI 라벨링", "대상 검토"].map((label, index) => (
          <li
            key={label}
            className={`rounded-md border px-3 py-2 ${step === index + 1 ? "border-accent bg-accent-soft font-medium" : "border-line bg-panel"}`}
            aria-current={step === index + 1 ? "step" : undefined}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="요약">
        <SummaryCard label="전체 접점" value={counts ? counts.total.toLocaleString("ko-KR") : "—"} />
        <SummaryCard label="고유 고객" value={counts ? counts.customers.toLocaleString("ko-KR") : "—"} />
        <SummaryCard
          label="A/B 후보 접점"
          value={counts ? counts.ab.toLocaleString("ko-KR") : "—"}
          note={partial ? "현재 완료분 기준" : undefined}
        />
        <SummaryCard label="처리 완료" value={counts ? counts.done.toLocaleString("ko-KR") : "—"} />
        <SummaryCard label="검토 필요" value={counts ? counts.review.toLocaleString("ko-KR") : "—"} />
      </section>

      {!ready && <p className="mt-4 text-sm text-muted">저장된 작업을 확인하고 있습니다. API는 호출하지 않습니다.</p>}
      {configError && (
        <p role="alert" className="mt-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {configError}
        </p>
      )}
      {config && !config.configured && (
        <p role="alert" className="mt-4 rounded-md border border-line bg-panel px-3 py-2 text-sm">
          {CONFIG_MESSAGE}
        </p>
      )}
      {config?.model && <p className="mt-2 text-xs text-muted">설정 모델 {config.model}</p>}
      {criteriaBlocked && (
        <p role="alert" className="mt-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          저장된 작업의 라벨 기준이 현재 버전과 달라 불러오지 않았습니다. 초기화 후 파일을 다시 올려 주세요.
        </p>
      )}
      {modelMismatch && (
        <p role="alert" className="mt-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          저장된 작업은 다른 모델 기준입니다. 결과를 섞지 않도록 이어서 처리하지 않습니다. 초기화한 뒤 다시 시작해 주세요.
        </p>
      )}
      {notice && <p className="mt-4 text-sm text-muted">{notice}</p>}

      <div className="mt-4 space-y-4">
        <UploadPanel
          fileName={draftName ?? job?.fileName ?? null}
          parsed={draft ?? (job ? previewFromJob(job) : null)}
          encodingError={encodingError}
          disabled={!ready || running}
          onFile={(file) => void onFile(file)}
          onOpenCriteria={() => setCriteriaOpen(true)}
        />
        {!draft && !job && ready && (
          <div className="panel text-sm text-muted">업로드 전입니다. CSV를 올리면 접점 수와 미리보기가 표시됩니다.</div>
        )}
        <RunPanel
          records={activeJob ? activeJob.records : null}
          running={running}
          pauseRequested={pauseRequested}
          canStart={canStart}
          canResume={canResume}
          blockReason={draft && !draft.canRun ? draft.blockReason : null}
          message={job?.haltMessage ?? null}
          batchSize={batchSize}
          onBatchSize={(value) => setBatchSize(clampBatch(value))}
          onStart={() => job && void execute(job.records)}
          onPause={() => {
            pauseRef.current = true;
            setPauseRequested(true);
          }}
          onResume={() => job && void execute(job.records)}
          onRetry={() => {
            if (!job) return;
            const retried = job.records.map((record) =>
              record.status === "실패"
                ? {
                    ...record,
                    status: "대기" as const,
                    attempts: 0,
                    error: null,
                    grade: null,
                    selectionReason: null,
                    analysis: null,
                    processingMethod: null,
                    model: null,
                  }
                : record,
            );
            void execute(retried);
          }}
        />
{activeJob ? (
            <>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => download("all", "csv")}>
                전체 결과 CSV
              </button>
              <button type="button" className="btn-secondary" onClick={() => download("all", "json")}>
                전체 결과 JSON
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={activeJob.selectedIds.length === 0}
                onClick={() => download("selected", "csv")}
              >
                선택한 후보 CSV
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={activeJob.selectedIds.length === 0}
                onClick={() => download("selected", "json")}
              >
                선택한 후보 JSON
              </button>
            </div>
            <p className="text-xs text-muted">{SORT_NOTE}</p>
            <ResultsWorkspace
              records={activeJob.records}
              columns={activeJob.columns}
              selectedIds={activeJob.selectedIds}
              activeId={activeId}
              analyzed={analyzed}
              onOpen={setActiveId}
              onSelectIds={(ids) => replaceJob({ ...activeJob, selectedIds: ids, updatedAt: new Date().toISOString() })}
            />
          </>
        ) : (
          <div className="panel text-sm text-muted">
            {draft && !draft.canRun
              ? "파일 오류를 수정하기 전에는 결과를 만들지 않습니다."
              : "분석 전입니다. 유효한 CSV를 올리면 대상 검토를 시작할 수 있습니다."}
          </div>
        )}
      </div>
      <CriteriaDialog open={criteriaOpen} onClose={() => setCriteriaOpen(false)} />
    </main>
  );
}

function SummaryCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <article className="panel">
      <h2 className="text-xs text-muted">{label}</h2>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </article>
  );
}

function previewFromJob(current: StoredJob): ParsedCsv {
  return {
    columns: current.columns,
    rows: current.records.map((record) => record.source),
    dataRowCount: current.records.length,
    uniqueCustomerCount: countUniqueCustomers(current.records),
    blankCounts: blankCounts(current.records, current.columns),
    missingColumns: [],
    missingIdRows: [],
    duplicateIds: [],
    parseErrors: [],
    preview: current.records.slice(0, BATCH_SETTINGS.previewRows).map((record) => record.source),
    canRun: true,
    blockReason: null,
  };
}

function clampBatch(value: number): number {
  if (!Number.isFinite(value)) return BATCH_SETTINGS.defaultBatchSize;
  return Math.min(BATCH_SETTINGS.maxBatchSize, Math.max(1, Math.round(value)));
}
