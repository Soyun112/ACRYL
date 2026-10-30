import { z } from "zod";
import {
  ANALYSIS_FIELDS,
  CONTACT_PURPOSES,
  EVIDENCE_LABELS,
  FOLLOW_UP_REQUESTS,
  INTEREST_AREAS,
  MEETING_INTENTS,
  NOT_APPLICABLE,
  REVIEW_REASONS,
  REVIEW_STAGES,
  UNKNOWN,
  type AnalysisField,
} from "@/lib/criteria";
import { normalizeText } from "@/lib/text";
import type { AnalysisLabels, LabelContactInput, LabelItemResult } from "@/lib/types";

function enumOf<T extends string>(values: readonly T[]) {
  return z.enum(values as [T, ...T[]]);
}

export const analysisSchema = z
  .object({
    contactId: z.string().min(1),
    contactPurposes: z.array(enumOf(CONTACT_PURPOSES)).min(1),
    interestAreas: z.array(enumOf(INTEREST_AREAS)).min(1),
    workNeed: z.string().min(1),
    reviewStages: z.array(enumOf(REVIEW_STAGES)).min(1),
    followUpRequests: z.array(enumOf(FOLLOW_UP_REQUESTS)).min(1),
    meetingIntent: enumOf(MEETING_INTENTS),
    reviewReasons: z.array(enumOf(REVIEW_REASONS)).min(1),
    evidence: z.array(
      z
        .object({
          label: enumOf(EVIDENCE_LABELS),
          field: enumOf(ANALYSIS_FIELDS),
          quote: z.string().min(1),
        })
        .strict(),
    ),
    followUpQuestions: z.array(z.string()).max(2),
  })
  .strict();

export const modelResponseSchema = z
  .object({
    results: z.array(analysisSchema),
  })
  .strict();

function exclusiveUnknown(values: readonly string[], label: string): string | null {
  if (values.includes(UNKNOWN) && values.length > 1) {
    return `${label}에 미확인과 다른 값을 함께 넣을 수 없습니다.`;
  }
  if (new Set(values).size !== values.length) {
    return `${label}에 중복 값이 있습니다.`;
  }
  return null;
}

function assignedLabels(labels: AnalysisLabels): Set<string> {
  const assigned = new Set<string>();
  for (const value of labels.contactPurposes) if (value !== UNKNOWN) assigned.add(value);
  for (const value of labels.interestAreas) if (value !== UNKNOWN) assigned.add(value);
  for (const value of labels.reviewStages) if (value !== UNKNOWN) assigned.add(value);
  for (const value of labels.followUpRequests) if (value !== UNKNOWN) assigned.add(value);
  if (labels.meetingIntent !== UNKNOWN) assigned.add(labels.meetingIntent);
  if (labels.workNeed !== UNKNOWN) assigned.add("업무요구");
  return assigned;
}

function hasConcreteLabel(labels: AnalysisLabels): boolean {
  return assignedLabels(labels).size > 0;
}

export function validateAnalysis(raw: unknown, sourceFields: Record<AnalysisField, string>): 
  | { ok: true; analysis: AnalysisLabels }
  | { ok: false; error: string } {
  const parsed = analysisSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "응답 필드가 라벨 기준과 맞지 않습니다." };
  }
  const labels = parsed.data;
  const checks = [
    exclusiveUnknown(labels.contactPurposes, "접촉목적"),
    exclusiveUnknown(labels.interestAreas, "관심분야"),
    exclusiveUnknown(labels.reviewStages, "검토단계"),
    exclusiveUnknown(labels.followUpRequests, "후속요청"),
    exclusiveUnknown(labels.reviewReasons, "검토사유"),
  ];
  for (const message of checks) {
    if (message) return { ok: false, error: message };
  }
  if (labels.reviewReasons.includes(NOT_APPLICABLE) && labels.reviewReasons.length > 1) {
    return { ok: false, error: "검토사유의 해당 없음은 다른 사유와 함께 넣을 수 없습니다." };
  }
  if (labels.followUpQuestions.some((question) => question.trim().length === 0)) {
    return { ok: false, error: "추가 확인 질문이 비어 있습니다." };
  }
  if (labels.followUpQuestions.length > 2) {
    return { ok: false, error: "추가 확인 질문은 최대 2개입니다." };
  }
  const assigned = assignedLabels(labels);
  if (hasConcreteLabel(labels) && labels.evidence.length === 0) {
    return { ok: false, error: "구체적인 라벨에는 원문 근거 인용이 필요합니다." };
  }
  for (const item of labels.evidence) {
    if (item.label !== UNKNOWN && !assigned.has(item.label)) {
      return { ok: false, error: "근거 라벨이 추출된 라벨과 맞지 않습니다." };
    }
    const source = normalizeText(sourceFields[item.field] ?? "");
    const quote = normalizeText(item.quote);
    if (!source.includes(quote)) {
      return { ok: false, error: `근거 인용이 ${item.field} 원문에 없습니다.` };
    }
  }
  return { ok: true, analysis: labels };
}

export function matchResults(contacts: LabelContactInput[], modelJson: unknown): LabelItemResult[] {
  const parsed = modelResponseSchema.safeParse(modelJson);
  const requested = new Set(contacts.map((contact) => contact.contactId));
  const sources = new Map(contacts.map((contact) => [contact.contactId, contact.fields]));
  if (!parsed.success) {
    return contacts.map((contact) => ({
      contactId: contact.contactId,
      ok: false as const,
      error: "응답 JSON 구조가 라벨 스키마와 맞지 않습니다.",
    }));
  }

  const grouped = new Map<string, unknown[]>();
  for (const item of parsed.data.results) {
    if (!requested.has(item.contactId)) continue;
    const list = grouped.get(item.contactId) ?? [];
    list.push(item);
    grouped.set(item.contactId, list);
  }

  return contacts.map((contact) => {
    const items = grouped.get(contact.contactId) ?? [];
    if (items.length === 0) {
      return { contactId: contact.contactId, ok: false as const, error: "응답에 이 접점ID가 없습니다." };
    }
    if (items.length > 1) {
      return {
        contactId: contact.contactId,
        ok: false as const,
        error: "응답에 접점ID가 중복되었습니다.",
      };
    }
    const validated = validateAnalysis(items[0], sources.get(contact.contactId)!);
    if (!validated.ok) {
      return { contactId: contact.contactId, ok: false as const, error: validated.error };
    }
    return { contactId: contact.contactId, ok: true as const, analysis: validated.analysis };
  });
}
