"use client";

import { useEffect, useRef, useState } from "react";
import { CriteriaDialog } from "@/components/criteria-dialog";
import { ResultsWorkspace } from "@/components/results-workspace";
import { RunPanel } from "@/components/run-panel";
import { UploadPanel } from "@/components/upload-panel";
import { BATCH_SETTINGS, CRITERIA_VERSION } from "@/lib/criteria";
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
  const [moreOpen, setMoreOpen] = useState(false);
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
    if (job || draft) {
      const confirmed = window.confirm("저장된 업로드와 라벨링 결과를 삭제할까요?");
      if (!confirmed) return;
    }
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

  const needsSetup = Boolean((config && !config.configured) || job?.haltMessage === CONFIG_MESSAGE);
  const runMessage = job?.haltMessage && job.haltMessage !== CONFIG_MESSAGE ? job.haltMessage : null;
  const apiLabel = !ready ? "확인 중" : configError || !config ? "확인 실패" : config.configured ? "연결됨" : "설정 필요";
  const steps = ["데이터 업로드", "AI 분석", "제안 대상 검토"];

  return (
    <div className="min-h-screen">
      <header className="site-header">
        <p className="brand">AX CONNECT</p>
        <div className="header-actions">
          <span className="inline-flex items-center gap-2" role="status">
            {config?.configured && <span className="h-1.5 w-1.5 rounded-full bg-cyan" aria-hidden="true" />}
            {apiLabel}
          </span>
          <button type="button" className="btn-ghost" onClick={() => setCriteriaOpen(true)}>
            분류 기준
          </button>
          <div className="relative">
            <button
              type="button"
              className="btn-ghost"
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              onClick={() => setMoreOpen((open) => !open)}
            >
              더보기
            </button>
            {moreOpen && (
              <div role="menu" className="absolute right-0 z-20 mt-1 min-w-36 bg-panel py-1 text-ink shadow-lg">
                <button
                  type="button"
                  role="menuitem"
                  className="btn-ghost w-full text-left"
                  disabled={running || !ready}
                  onClick={() => {
                    setMoreOpen(false);
                    void reset();
                  }}
                >
                  초기화
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <section className={analyzed ? "hero hero-compact" : "hero"}>
        <div className="shell">
          <p className="hero-kicker">EXHIBITION CRM</p>
          <h1>{step === 3 ? "제안 대상 검토" : "관심의 기록을, 다음 제안으로."}</h1>
          {!analyzed && <p>상담 기록에서 고객의 요구를 읽고, 맞춤 제안을 준비할 대상을 찾습니다.</p>}
        </div>
      </section>
      <div className="shell">
        <ol className="steps" aria-label="진행 단계">
          {steps.map((label, index) => {
            const state = step === index + 1 ? "current" : step > index + 1 ? "done" : "";
            return (
              <li key={label} className="flex items-center">
                {index > 0 && <span className="step-line" aria-hidden="true" />}
                <span className={`step ${state}`} aria-current={step === index + 1 ? "step" : undefined}>
                  <span className="step-index">{String(index + 1).padStart(2, "0")}</span>
                  <strong>{label}</strong>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      {counts && (
        <dl className="summary-bar" aria-label="요약">
          <div>
            <dt>전체 접점</dt>
            <dd>{counts.total.toLocaleString("ko-KR")}</dd>
          </div>
          <div>
            <dt>고유 고객</dt>
            <dd>{counts.customers.toLocaleString("ko-KR")}</dd>
          </div>
          <div>
            <dt>A/B 후보 접점</dt>
            <dd>{analyzed ? counts.ab.toLocaleString("ko-KR") : "분석 후 표시"}</dd>
            {analyzed && partial && <small>현재 완료분 기준</small>}
          </div>
          <div>
            <dt>분석 완료</dt>
            <dd>{analyzed ? counts.done.toLocaleString("ko-KR") : "분석 후 표시"}</dd>
          </div>
          <div>
            <dt>검토 필요</dt>
            <dd>{analyzed ? counts.review.toLocaleString("ko-KR") : "분석 후 표시"}</dd>
          </div>
        </dl>
      )}
      <main>
        {!ready && <p className="shell py-4 text-sm text-muted">저장된 작업을 확인하고 있습니다. API는 호출하지 않습니다.</p>}
        {configError && (
          <p role="alert" className="shell py-3 text-sm text-danger">
            {configError}
          </p>
        )}
        {needsSetup && (
          <div className="shell py-3 text-sm">
            <p>AI 연결 설정이 필요합니다.</p>
            <details className="mt-2">
              <summary className="cursor-pointer font-medium">관리자 설정 안내</summary>
              <p className="mt-2 max-w-3xl leading-6 text-muted">
                서버 환경변수 GEMINI_API_KEY와 GEMINI_MODEL을 확인하세요. 로컬에서는 프로젝트 루트의 .env.local에 넣은 뒤 개발 서버를 다시
                시작하고, 배포 환경에서는 같은 값을 설정한 뒤 다시 배포하세요. API 키 값은 이 화면에 표시하지 않습니다.
                {config?.model ? ` 현재 설정된 모델은 ${config.model}입니다.` : ""}
              </p>
            </details>
          </div>
        )}
        {criteriaBlocked && (
          <p role="alert" className="shell py-3 text-sm text-danger">
            저장된 작업의 라벨 기준이 현재 버전과 달라 불러오지 않았습니다. 더보기의 초기화 후 파일을 다시 올려 주세요.
          </p>
        )}
        {modelMismatch && (
          <p role="alert" className="shell py-3 text-sm text-danger">
            저장된 작업은 다른 모델 기준입니다. 결과를 섞지 않도록 이어서 처리하지 않습니다. 초기화한 뒤 다시 시작해 주세요.
          </p>
        )}
        {notice && <p className="shell py-3 text-sm text-muted">{notice}</p>}
        <UploadPanel
          fileName={draftName ?? job?.fileName ?? null}
          parsed={draft ?? (job ? previewFromJob(job) : null)}
          encodingError={encodingError}
          disabled={!ready || running}
          onFile={(file) => void onFile(file)}
        />
        {activeJob && (
          <RunPanel
            records={activeJob.records}
            running={running}
            pauseRequested={pauseRequested}
            canStart={canStart}
            canResume={canResume}
            message={runMessage}
            batchSize={batchSize}
            onBatchSize={(value) => setBatchSize(clampBatch(value))}
            onStart={() => void execute(activeJob.records)}
            onPause={() => {
              pauseRef.current = true;
              setPauseRequested(true);
            }}
            onResume={() => void execute(activeJob.records)}
            onRetry={() => {
              const retried = activeJob.records.map((record) =>
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
        )}
        {activeJob && !analyzed && (
          <div className="shell pb-4">
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">다운로드</summary>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" onClick={() => download("all", "csv")}>
                  전체 결과 CSV
                </button>
                <button type="button" className="btn-secondary" onClick={() => download("all", "json")}>
                  전체 결과 JSON
                </button>
              </div>
            </details>
          </div>
        )}
        {activeJob && analyzed && (
          <ResultsWorkspace
            records={activeJob.records}
            columns={activeJob.columns}
            selectedIds={activeJob.selectedIds}
            activeId={activeId}
            onOpen={setActiveId}
            onSelectIds={(ids) => replaceJob({ ...activeJob, selectedIds: ids, updatedAt: new Date().toISOString() })}
            onDownload={download}
          />
        )}
      </main>
      <footer className="site-footer">AI+X 해커톤 프로젝트</footer>
      <CriteriaDialog open={criteriaOpen} onClose={() => setCriteriaOpen(false)} />
    </div>
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
