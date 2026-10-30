import { isBlank } from "@/lib/text";
import type { ContactRecord } from "@/lib/types";

export function countUniqueCustomers(records: Array<{ customerId: string }>): number {
  const ids = new Set<string>();
  for (const record of records) {
    if (!isBlank(record.customerId)) ids.add(record.customerId.trim());
  }
  return ids.size;
}

export function countByStatus(records: ContactRecord[]) {
  return {
    total: records.length,
    pending: records.filter((record) => record.status === "대기").length,
    processing: records.filter((record) => record.status === "처리 중").length,
    done: records.filter((record) => record.status === "완료").length,
    failed: records.filter((record) => record.status === "실패").length,
    unmatched: records.filter((record) => record.status === "저장 결과 없음").length,
    ab: records.filter((record) => record.status === "완료" && (record.grade === "A" || record.grade === "B")).length,
    review: records.filter((record) => record.grade === "검토").length,
    customers: countUniqueCustomers(records),
  };
}

export function blankCounts(records: ContactRecord[], columns: string[]) {
  return columns.map((field) => ({
    field,
    blank: records.filter((record) => isBlank(record.source[field])).length,
    total: records.length,
  }));
}
