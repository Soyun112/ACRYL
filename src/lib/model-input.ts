import { ANALYSIS_FIELDS, type AnalysisField } from "@/lib/criteria";
import type { ContactRecord, LabelContactInput } from "@/lib/types";

export function analysisCharLength(source: Record<string, string>): number {
  return ANALYSIS_FIELDS.reduce((sum, field) => sum + (source[field]?.length ?? 0), 0);
}

export function toLabelInput(record: ContactRecord): LabelContactInput {
  const fields = {} as Record<AnalysisField, string>;
  for (const field of ANALYSIS_FIELDS) {
    fields[field] = record.source[field] ?? "";
  }
  return { contactId: record.contactId, fields };
}

export function takeNextBatch(
  records: ContactRecord[],
  batchSize: number,
  charBudget: number,
  onlyIds?: Set<string>,
): ContactRecord[] {
  const pending = records.filter((record) => {
    if (record.status !== "대기") return false;
    if (onlyIds && !onlyIds.has(record.contactId)) return false;
    return true;
  });
  const batch: ContactRecord[] = [];
  let chars = 0;
  for (const record of pending) {
    const length = Math.max(1, analysisCharLength(record.source));
    if (batch.length > 0 && (batch.length >= batchSize || chars + length > charBudget)) break;
    batch.push(record);
    chars += length;
  }
  return batch;
}
