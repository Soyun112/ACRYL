import {
  ANALYSIS_FIELDS,
  CRITERIA_VERSION,
  RULE_EMPTY_METHOD,
  UNKNOWN,
} from "@/lib/criteria";
import { gradeAnalysis } from "@/lib/grade";
import { isBlank } from "@/lib/text";
import type { AnalysisLabels, ContactRecord } from "@/lib/types";

export function isRuleEmpty(source: Record<string, string>): boolean {
  return ANALYSIS_FIELDS.filter((field) => field !== "세그먼트").every((field) => isBlank(source[field]));
}

export function buildRuleEmptyLabels(): AnalysisLabels {
  return {
    contactPurposes: [UNKNOWN],
    interestAreas: [UNKNOWN],
    workNeed: UNKNOWN,
    reviewStages: [UNKNOWN],
    followUpRequests: [UNKNOWN],
    meetingIntent: UNKNOWN,
    reviewReasons: ["정보 부족"],
    evidence: [],
    followUpQuestions: [],
  };
}

export function applyPendingRuleRows(records: ContactRecord[]): ContactRecord[] {
  return records.map((record) => {
    if (record.status !== "대기" || !isRuleEmpty(record.source)) return record;
    const labels = buildRuleEmptyLabels();
    const graded = gradeAnalysis({ labels, ruleEmpty: true });
    return {
      ...record,
      status: "완료",
      attempts: record.attempts,
      processingMethod: RULE_EMPTY_METHOD,
      model: null,
      criteriaVersion: CRITERIA_VERSION,
      analysis: labels,
      grade: graded.grade,
      selectionReason: graded.selectionReason,
      error: null,
    };
  });
}
