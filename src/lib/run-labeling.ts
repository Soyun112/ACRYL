import { BATCH_SETTINGS, CRITERIA_VERSION, GEMINI_METHOD } from "@/lib/criteria";
import { applyPendingRuleRows } from "@/lib/empty-row";
import { gradeAnalysis } from "@/lib/grade";
import { takeNextBatch } from "@/lib/model-input";
import type { ContactRecord, LabelItemResult } from "@/lib/types";

export type FetchOutcome =
  | { type: "ok"; model: string; results: LabelItemResult[] }
  | { type: "retry_batch"; code: "RATE_LIMIT" | "TRANSIENT" | "BAD_RESPONSE"; message: string }
  | { type: "halt"; code: "AUTH" | "QUOTA" | "CONFIG"; message: string }
  | { type: "output_limit"; message: string }
  | { type: "fail_batch"; message: string };

export interface RunUpdate {
  records: ContactRecord[];
  phase: "running" | "paused" | "completed" | "halted";
  message: string | null;
}

export interface RunOptions {
  records: ContactRecord[];
  batchSize: number;
  charBudget?: number;
  maxAttempts?: number;
  isPaused: () => boolean;
  fetchBatch: (records: ContactRecord[]) => Promise<FetchOutcome>;
  sleep: (ms: number) => Promise<void>;
  onUpdate: (update: RunUpdate) => void;
}

function mapIds(
  records: ContactRecord[],
  ids: string[],
  updater: (record: ContactRecord) => ContactRecord,
): ContactRecord[] {
  const selected = new Set(ids);
  return records.map((record) => (selected.has(record.contactId) ? updater(record) : record));
}

function failRecord(record: ContactRecord, message: string): ContactRecord {
  const graded = record.analysis
    ? gradeAnalysis({ labels: record.analysis, failed: true, failureMessage: message })
    : null;
  return {
    ...record,
    status: "실패",
    processingMethod: record.processingMethod,
    analysis: null,
    grade: "검토",
    selectionReason: graded?.selectionReason ?? `${message} 검토가 필요합니다.`,
    error: message,
    criteriaVersion: CRITERIA_VERSION,
  };
}

function backoffMs(attempt: number): number {
  return Math.min(BATCH_SETTINGS.maxRetryDelayMs, BATCH_SETTINGS.retryBaseDelayMs * 2 ** Math.max(0, attempt - 1));
}

export async function runLabeling(options: RunOptions): Promise<RunUpdate> {
  let records = applyPendingRuleRows(options.records);
  const charBudget = options.charBudget ?? BATCH_SETTINGS.charBudget;
  const maxAttempts = options.maxAttempts ?? BATCH_SETTINGS.maxAttempts;
  let sizeCap = options.batchSize;
  let priority: Set<string> | null = null;
  let message: string | null = null;

  const publish = (phase: RunUpdate["phase"], nextMessage: string | null = message) => {
    message = nextMessage;
    const update = { records, phase, message: nextMessage };
    options.onUpdate(update);
    return update;
  };

  publish("running", null);

  while (true) {
    records = applyPendingRuleRows(records);
    if (options.isPaused()) return publish("paused");

    const batch = takeNextBatch(records, sizeCap, charBudget, priority ?? undefined);
    if (batch.length === 0) {
      if (priority) {
        priority = null;
        continue;
      }
      return publish("completed", message);
    }

    const ids = batch.map((record) => record.contactId);
    records = mapIds(records, ids, (record) => ({
      ...record,
      status: "처리 중",
      attempts: record.attempts + 1,
      error: null,
    }));
    publish("running");

    let outcome: FetchOutcome;
    try {
      outcome = await options.fetchBatch(batch);
    } catch {
      outcome = {
        type: "retry_batch",
        code: "TRANSIENT",
        message: "네트워크 오류로 요청이 전송되지 않았습니다.",
      };
    }

    if (outcome.type === "halt") {
      records = mapIds(records, ids, (record) => failRecord(record, outcome.message));
      return publish("halted", outcome.message);
    }

    if (outcome.type === "output_limit") {
      if (ids.length > 1) {
        records = mapIds(records, ids, (record) => ({
          ...record,
          status: "대기",
          attempts: Math.max(0, record.attempts - 1),
        }));
        sizeCap = Math.max(1, Math.floor(ids.length / 2));
        priority = new Set(ids);
        publish("running", outcome.message);
        continue;
      }
      records = mapIds(records, ids, (record) => failRecord(record, outcome.message));
      priority = null;
      publish("running", outcome.message);
      continue;
    }

    if (outcome.type === "retry_batch" || outcome.type === "fail_batch") {
      const retryMessage = outcome.message;
      const canRetry = outcome.type === "retry_batch" && batch.some((record) => {
        const current = records.find((item) => item.contactId === record.contactId);
        return (current?.attempts ?? maxAttempts) < maxAttempts;
      });
      if (canRetry) {
        records = mapIds(records, ids, (record) => ({ ...record, status: "대기" }));
        priority = new Set(ids);
        publish("running", retryMessage);
        await options.sleep(backoffMs(batch[0] ? records.find((item) => item.contactId === batch[0].contactId)?.attempts ?? 1 : 1));
        continue;
      }
      records = mapIds(records, ids, (record) => failRecord(record, retryMessage));
      priority = null;
      publish("running", retryMessage);
      continue;
    }

    sizeCap = options.batchSize;
    const byId = new Map(outcome.results.map((item) => [item.contactId, item]));
    const retryIds: string[] = [];
    records = records.map((record) => {
      if (!ids.includes(record.contactId)) return record;
      const item = byId.get(record.contactId);
      const error = !item ? "응답에 이 접점ID가 없습니다." : item.ok ? null : item.error;
      if (!error && item?.ok) {
        const graded = gradeAnalysis({ labels: item.analysis, failed: false });
        return {
          ...record,
          status: "완료",
          processingMethod: GEMINI_METHOD,
          model: outcome.model,
          criteriaVersion: CRITERIA_VERSION,
          analysis: item.analysis,
          grade: graded.grade,
          selectionReason: graded.selectionReason,
          error: null,
        };
      }
      if (record.attempts < maxAttempts) {
        retryIds.push(record.contactId);
        return { ...record, status: "대기", error };
      }
      return failRecord(record, error ?? "결과 검증에 실패했습니다.");
    });
    priority = retryIds.length > 0 ? new Set(retryIds) : null;
    publish("running");
  }
}
