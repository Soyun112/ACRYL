"use client";

import { BATCH_SETTINGS, TRANSMISSION_NOTE } from "@/lib/criteria";
import type { ContactRecord } from "@/lib/types";
import { countByStatus } from "@/lib/summary";

export function RunPanel({
  records,
  running,
  pauseRequested,
  canStart,
  canResume,
  blockReason,
  message,
  batchSize,
  onBatchSize,
  onStart,
  onPause,
  onResume,
  onRetry,
}: {
  records: ContactRecord[] | null;
  running: boolean;
  pauseRequested: boolean;
  canStart: boolean;
  canResume: boolean;
  blockReason: string | null;
  message: string | null;
  batchSize: number;
  onBatchSize: (value: number) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
}) {
  const counts = records ? countByStatus(records) : null;
  const failed = counts?.failed ?? 0;
  const progress = counts ? counts.done + counts.failed : 0;

  return (
    <section className="panel" aria-labelledby="run-title">
      <h2 id="run-title" className="text-base font-semibold">
        AI 라벨링
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">{TRANSMISSION_NOTE}</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          묶음 크기
          <input
            className="field ml-2 w-20"
            type="number"
            min={1}
            max={BATCH_SETTINGS.maxBatchSize}
            value={batchSize}
            disabled={running}
            onChange={(event) => onBatchSize(Number(event.target.value))}
          />
        </label>
        <button type="button" className="btn-primary" disabled={!canStart || running} onClick={onStart}>
          전체 라벨링 시작
        </button>
        <button type="button" className="btn-secondary" disabled={!running} onClick={onPause}>
          일시정지
        </button>
        <button type="button" className="btn-secondary" disabled={!canResume || running} onClick={onResume}>
          이어서 처리
        </button>
        <button type="button" className="btn-secondary" disabled={running || failed === 0} onClick={onRetry}>
          실패 항목 재시도
        </button>
      </div>
      {pauseRequested && (
        <p className="mt-3 text-sm text-muted">현재 요청이 끝나면 다음 묶음부터 멈춥니다.</p>
      )}
      {blockReason && (
        <p role="alert" className="mt-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {blockReason}
        </p>
      )}
      {message && (
        <p role="alert" className="mt-3 rounded-md border border-line bg-canvas px-3 py-2 text-sm">
          {message}
        </p>
      )}
      {counts && (
        <div className="mt-4" aria-live="polite">
          <progress className="h-2 w-full" value={progress} max={Math.max(counts.total, 1)} />
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
            <Count label="전체" value={counts.total} />
            <Count label="대기" value={counts.pending} />
            <Count label="처리 중" value={counts.processing} />
            <Count label="완료" value={counts.done} />
            <Count label="실패" value={counts.failed} />
          </dl>
        </div>
      )}
    </section>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-line px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold">{value.toLocaleString("ko-KR")}</dd>
    </div>
  );
}
