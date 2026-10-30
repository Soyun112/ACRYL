import Papa from "papaparse";
import { EXPORT_SCHEMA_VERSION } from "@/lib/criteria";
import type { ContactRecord } from "@/lib/types";

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function excelSafe(value: string): string {
  if (FORMULA_PREFIX.test(value)) return `'${value}`;
  return value;
}

export function formatList(values: string[] | null | undefined): string {
  if (!values || values.length === 0) return "";
  return values.join(" | ");
}

export function formatEvidence(record: ContactRecord): string {
  if (!record.analysis) return "";
  return record.analysis.evidence
    .map((item) => `${item.label} [${item.field}] ${item.quote}`)
    .join(" / ");
}

const DERIVED_HEADERS = [
  "후보등급",
  "선정이유",
  "라벨_접촉목적",
  "라벨_관심분야",
  "라벨_업무요구",
  "라벨_검토단계",
  "라벨_후속요청",
  "라벨_미팅의사",
  "라벨_검토사유",
  "라벨_판단근거",
  "라벨_추가확인사항",
  "처리상태",
  "처리방식",
  "모델",
  "기준버전",
] as const;

export function exportRows(records: ContactRecord[], columns: string[]): string[][] {
  const header = [...columns, ...DERIVED_HEADERS];
  const body = records.map((record) => {
    const analysis = record.analysis;
    const derived = [
      record.grade ?? "",
      record.selectionReason ?? "",
      formatList(analysis?.contactPurposes),
      formatList(analysis?.interestAreas),
      analysis?.workNeed ?? "",
      formatList(analysis?.reviewStages),
      formatList(analysis?.followUpRequests),
      analysis?.meetingIntent ?? "",
      formatList(analysis?.reviewReasons),
      formatEvidence(record),
      formatList(analysis?.followUpQuestions),
      record.status,
      record.processingMethod ?? "",
      record.model ?? "",
      record.criteriaVersion,
    ];
    return [...columns.map((column) => excelSafe(record.source[column] ?? "")), ...derived.map(excelSafe)];
  });
  return [header, ...body];
}

export function toCsv(matrix: string[][]): string {
  return `\uFEFF${Papa.unparse(matrix)}`;
}

export function exportJson(records: ContactRecord[], scope: "all" | "selected") {
  return {
    exportSchemaVersion: EXPORT_SCHEMA_VERSION,
    scope,
    exportedAt: new Date().toISOString(),
    count: records.length,
    contacts: records.map((record) => ({
      contactId: record.contactId,
      customerId: record.customerId,
      processingStatus: record.status,
      processingMethod: record.processingMethod,
      model: record.model,
      criteriaVersion: record.criteriaVersion,
      source: record.source,
      analysis: record.analysis
        ? {
            grade: record.grade,
            selectionReason: record.selectionReason,
            contactPurposes: record.analysis.contactPurposes,
            interestAreas: record.analysis.interestAreas,
            workNeed: record.analysis.workNeed,
            reviewStages: record.analysis.reviewStages,
            followUpRequests: record.analysis.followUpRequests,
            meetingIntent: record.analysis.meetingIntent,
            reviewReasons: record.analysis.reviewReasons,
            evidence: record.analysis.evidence,
            followUpQuestions: record.analysis.followUpQuestions,
          }
        : {
            grade: record.grade,
            selectionReason: record.selectionReason,
            contactPurposes: [],
            interestAreas: [],
            workNeed: "",
            reviewStages: [],
            followUpRequests: [],
            meetingIntent: null,
            reviewReasons: [],
            evidence: [],
            followUpQuestions: [],
          },
    })),
  };
}

export function selectRecords(records: ContactRecord[], selectedIds: string[]): ContactRecord[] {
  const selected = new Set(selectedIds);
  return records.filter((record) => selected.has(record.contactId));
}
