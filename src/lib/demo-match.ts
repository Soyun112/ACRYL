import { z } from "zod";
import {
  ANALYSIS_FIELDS,
  CONTACT_PURPOSES,
  DEMO_METHOD,
  FOLLOW_UP_REQUESTS,
  GRADE_LABELS,
  GRADES,
  INTEREST_AREAS,
  MEETING_INTENTS,
  REVIEW_REASONS,
  REVIEW_STAGES,
  UNKNOWN,
  type AnalysisField,
} from "@/lib/criteria";
import { isBlank } from "@/lib/text";
import type { AnalysisLabels, ContactRecord, Evidence, Grade } from "@/lib/types";

function enumOf<T extends string>(values: readonly T[]) {
  return z.enum(values as [T, ...T[]]);
}

const inputSchema = z
  .object({
    세그먼트: z.string(),
    요청유형: z.string(),
    현장요청: z.string(),
    관심제품: z.string(),
    관심분야: z.string(),
    참관목적: z.string(),
    후속미팅희망: z.string(),
  })
  .strict();

const labelsSchema = z
  .object({
    접촉목적: z.array(enumOf(CONTACT_PURPOSES)).min(1),
    관심분야: z.array(enumOf(INTEREST_AREAS)).min(1),
    업무요구: z.string().min(1),
    검토단계: z.array(enumOf(REVIEW_STAGES)).min(1),
    후속요청: z.array(enumOf(FOLLOW_UP_REQUESTS)).min(1),
    미팅의사: enumOf(MEETING_INTENTS),
    검토사유: z.array(enumOf(REVIEW_REASONS)).min(1),
    판단근거: z.array(
      z
        .object({
          field: enumOf(ANALYSIS_FIELDS),
          quote: z.string().min(1),
        })
        .strict(),
    ),
    추가확인사항: z.array(z.string().min(1)),
  })
  .strict();

const resultSchema = z
  .object({
    contactId: z.string().min(1),
    customerId: z.string(),
    input: inputSchema,
    status: z.string(),
    source: z.string(),
    labels: labelsSchema,
    grade: enumOf(GRADES),
    gradeLabel: z.string().min(1),
    reason: z.string().min(1),
    score: z.null(),
  })
  .strict();

export const demoCatalogSchema = z
  .object({
    criteriaVersion: z.string().min(1),
    provenance: z
      .object({
        displayLabel: z.string().min(1),
      })
      .passthrough(),
    matchingFields: z.array(z.string()),
    results: z.array(resultSchema).min(1),
  })
  .passthrough();

export type DemoCatalog = z.infer<typeof demoCatalogSchema>;

export interface DemoLookupRow {
  contactId: string;
  fields: Record<AnalysisField, string>;
}

export type DemoMatch =
  | {
      contactId: string;
      matched: true;
      analysis: AnalysisLabels;
      grade: Grade;
      selectionReason: string;
    }
  | {
      contactId: string;
      matched: false;
    };

export function expectedGradeLabel(grade: Grade): string {
  if (grade === "검토") return "검토 필요";
  return GRADE_LABELS[grade];
}

export function normalizeMatchText(value: string | null | undefined): string {
  if (value == null) return "";
  const text = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  return isBlank(text) ? "" : text;
}

function matchKey(contactId: string, fields: Record<AnalysisField, string>): string {
  return [contactId.trim(), ...ANALYSIS_FIELDS.map((field) => normalizeMatchText(fields[field] ?? ""))].join("\u0000");
}

function evidenceLabel(labels: z.infer<typeof labelsSchema>): Evidence["label"] {
  const concrete = [
    ...labels.접촉목적,
    ...labels.관심분야,
    ...labels.검토단계,
    ...labels.후속요청,
    labels.미팅의사,
  ].find((value) => value !== UNKNOWN);
  if (concrete) return concrete;
  if (labels.업무요구 !== UNKNOWN) return "업무요구";
  return UNKNOWN;
}

function adapt(result: z.infer<typeof resultSchema>): Extract<DemoMatch, { matched: true }> {
  const labels = result.labels;
  const label = evidenceLabel(labels);
  return {
    contactId: result.contactId.trim(),
    matched: true,
    grade: result.grade,
    selectionReason: result.reason,
    analysis: {
      contactPurposes: labels.접촉목적,
      interestAreas: labels.관심분야,
      workNeed: labels.업무요구,
      reviewStages: labels.검토단계,
      followUpRequests: labels.후속요청,
      meetingIntent: labels.미팅의사,
      reviewReasons: labels.검토사유,
      evidence: labels.판단근거.map((item) => ({
        label,
        field: item.field,
        quote: item.quote,
      })),
      followUpQuestions: labels.추가확인사항,
    },
  };
}

export function matchDemoRows(catalog: DemoCatalog, rows: DemoLookupRow[]): DemoMatch[] {
  const indexed = new Map<string, Extract<DemoMatch, { matched: true }>[]>();
  for (const result of catalog.results) {
    const key = matchKey(result.contactId, result.input);
    const list = indexed.get(key) ?? [];
    list.push(adapt(result));
    indexed.set(key, list);
  }

  return rows.map((row) => {
    const hits = indexed.get(matchKey(row.contactId, row.fields)) ?? [];
    if (hits.length !== 1) return { contactId: row.contactId.trim(), matched: false as const };
    return { ...hits[0], contactId: row.contactId.trim() };
  });
}

export function applyDemoMatches(records: ContactRecord[], matches: DemoMatch[], criteriaVersion: string): ContactRecord[] {
  const byId = new Map<string, DemoMatch[]>();
  for (const match of matches) {
    const list = byId.get(match.contactId) ?? [];
    list.push(match);
    byId.set(match.contactId, list);
  }

  return records.map((record) => {
    const list = byId.get(record.contactId) ?? [];
    const match = list.length === 1 ? list[0] : undefined;
    if (!match?.matched) {
      return {
        ...record,
        status: "저장 결과 없음",
        processingMethod: null,
        model: null,
        analysis: null,
        grade: null,
        selectionReason: null,
        error: null,
      };
    }
    return {
      ...record,
      status: "완료",
      processingMethod: DEMO_METHOD,
      model: null,
      criteriaVersion,
      analysis: match.analysis,
      grade: match.grade,
      selectionReason: match.selectionReason,
      error: null,
    };
  });
}
