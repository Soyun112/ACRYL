"use client";

import { BATCH_SETTINGS, TRANSMISSION_NOTE } from "@/lib/criteria";
import { countByStatus } from "@/lib/summary";
import type { ContactRecord } from "@/lib/types";

export function RunPanel({
  records,
  running,
  pauseRequested,
  canStart,
  canResume,
  message,
  batchSize,
  onBatchSize,
  onStart,
  onPause,
  onResume,
  onRetry,
}: {
  records: ContactRecord[];
  running: boolean;
  pauseRequested: boolean;
  canStart: boolean;
  canResume: boolean;
  message: string | null;
  batchSize: number;
  onBatchSize: (value: number) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
}) {
  const counts = countByStatus(records);
  const started = records.some((record) => record.status !== "대기");
  const finished = !running && records.every((record) => record.status === "완료" || record.status === "실패");
  const width = counts.total === 0 ? 0 : Math.round(((counts.done + counts.failed) / counts.total) * 100);
  if (finished && counts.failed === 0) {
    if (!message) return null;
    return (
      <section className="shell py-4">
        <p role="alert" className="bg-danger-soft px-3 py-2 text-sm text-danger">
          {message}
        </p>
      </section>
    );
  }

  return (
    <section className="shell py-6" aria-labelledby="run-title">
      {started || running ? (
        <div aria-live="polite">
          <h2 id="run-title" className="text-xl font-bold">
            {running ? "고객의 관심과 요청을 분석하고 있습니다" : "분석 진행 상태"}
          </h2>
          <p className="mt-2 text-lg font-semibold">
            {counts.done.toLocaleString("ko-KR")} / {counts.total.toLocaleString("ko-KR")}건 완료
          </p>
          <div className="progress-track mt-4" aria-hidden="true">
            <span style={{ width: `${width}%` }} />
          </div>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div>
              <dt className="inline text-muted">완료 </dt>
              <dd className="inline font-semibold">{counts.done.toLocaleString("ko-KR")}</dd>
            </div>
            <div>
              <dt className="inline text-muted">실패 </dt>
              <dd className="inline font-semibold">{counts.failed.toLocaleString("ko-KR")}</dd>
            </div>
            <div>
              <dt className="inline text-muted">대기 </dt>
              <dd className="inline font-semibold">{counts.pending.toLocaleString("ko-KR")}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {running && (
              <button type="button" className="btn-secondary" onClick={onPause}>
                일시정지
              </button>
            )}
            {canResume && (
              <button type="button" className="btn-primary" onClick={onResume}>
                이어서 처리
              </button>
            )}
            {counts.failed > 0 && !running && (
              <button type="button" className="btn-secondary" onClick={onRetry}>
                실패 항목 재시도
              </button>
            )}
          </div>
          {pauseRequested && <p className="mt-3 text-sm text-muted">현재 요청이 끝나면 다음 묶음부터 멈춥니다.</p>}
        </div>
      ) : (
        <div>
          <h2 id="run-title" className="sr-only">
            AI 분석
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-muted">{TRANSMISSION_NOTE}</p>
          <button type="button" className="btn-primary mt-4" disabled={!canStart} onClick={onStart}>
            전체 AI 분석 시작
          </button>
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-medium">고급 설정</summary>
            <label className="mt-3 block">
              묶음 크기
              <input
                className="field ml-2 w-20"
                type="number"
                min={1}
                max={BATCH_SETTINGS.maxBatchSize}
                value={batchSize}
                onChange={(event) => onBatchSize(Number(event.target.value))}
              />
            </label>
          </details>
        </div>
      )}
      {message && (
        <p role="alert" className="mt-4 bg-danger-soft px-3 py-2 text-sm text-danger">
          {message}
        </p>
      )}
    </section>
  );
}
