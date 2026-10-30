import { CONTENT_CONFLICT, GRADE_LABELS, UNKNOWN } from "@/lib/criteria";
import type { AnalysisLabels, ContactRecord, Grade } from "@/lib/types";

const GRADE_RANK: Record<Grade, number> = {
  A: 0,
  B: 1,
  C: 2,
  D: 3,
  U: 4,
  검토: 5,
};

const SEPARATE_PURPOSES = ["협업", "공급·판매 제안", "투자"] as const;

export interface GradeInput {
  labels: AnalysisLabels;
  failed?: boolean;
  failureMessage?: string | null;
  ruleEmpty?: boolean;
}

export function gradeAnalysis(input: GradeInput): { grade: Grade; selectionReason: string } {
  const { labels } = input;
  const reviewBits: string[] = [];
  if (input.failed) {
    reviewBits.push(input.failureMessage?.trim() || "AI 처리 또는 결과 검증에 실패했습니다.");
  }
  if (labels.meetingIntent === "충돌") {
    reviewBits.push("미팅 의사 표현이 서로 충돌합니다.");
  }
  if (labels.reviewReasons.includes(CONTENT_CONFLICT)) {
    reviewBits.push("원문 내용이 충돌합니다.");
  }
  if (reviewBits.length > 0) {
    return {
      grade: "검토",
      selectionReason: `${reviewBits.join(" ")} 검토가 필요합니다.`,
    };
  }

  const separate = SEPARATE_PURPOSES.filter((purpose) => labels.contactPurposes.includes(purpose));
  const hasAdoption = labels.contactPurposes.includes("자사 도입");
  if (separate.length > 0 && !hasAdoption) {
    return {
      grade: "D",
      selectionReason: `자사 도입 근거 없이 ${separate.join(", ")} 목적이 확인되어 별도 대응 대상입니다.`,
    };
  }

  const prioritySignals: string[] = [];
  if (hasAdoption) prioritySignals.push("자사 도입 의사");
  if (labels.reviewStages.includes("도입 계획")) prioritySignals.push("도입 계획");
  if (labels.reviewStages.includes("PoC 검토")) prioritySignals.push("PoC 검토");
  if (labels.reviewStages.includes("운영 개선")) prioritySignals.push("운영 개선");
  if (labels.followUpRequests.includes("체험")) prioritySignals.push("체험 요청");
  if (labels.workNeed !== UNKNOWN && prioritySignals.length > 0) {
    return {
      grade: "A",
      selectionReason: `업무 요구가 확인되고 ${prioritySignals.join(", ")}에 해당하여 우선 조사 대상입니다.`,
    };
  }

  const confirmSignals: string[] = [];
  const explicitInterest = labels.interestAreas.filter((area) => area !== UNKNOWN);
  if (explicitInterest.length > 0) confirmSignals.push("명시적인 관심분야");
  if (hasAdoption) confirmSignals.push("자사 도입 의사");
  if (labels.followUpRequests.includes("견적")) confirmSignals.push("견적 요청");
  if (labels.followUpRequests.includes("체험")) confirmSignals.push("체험 요청");
  if (labels.followUpRequests.includes("미팅") || labels.meetingIntent === "희망") {
    confirmSignals.push("미팅 요청");
  }
  if (confirmSignals.length > 0) {
    return {
      grade: "B",
      selectionReason: `${confirmSignals.join(", ")}가 있어 추가 확인이 필요합니다.`,
    };
  }

  const guideSignals: string[] = [];
  if (labels.contactPurposes.includes("정보 탐색")) guideSignals.push("정보 탐색");
  if (labels.followUpRequests.includes("자료")) guideSignals.push("자료 요청");
  if (guideSignals.length > 0) {
    return {
      grade: "C",
      selectionReason: `${guideSignals.join(", ")}에 해당하여 자료 안내 대상입니다.`,
    };
  }

  if (input.ruleEmpty) {
    return {
      grade: "U",
      selectionReason: "세그먼트 외 분석 필드가 비어 있어 맞춤 제안 판단에 필요한 정보가 부족합니다.",
    };
  }
  return {
    grade: "U",
    selectionReason: "맞춤 제안을 고를 근거가 부족합니다.",
  };
}

export function gradeLabel(grade: Grade): string {
  if (grade === "검토") return "검토 필요";
  return `${grade} ${GRADE_LABELS[grade]}`;
}

export function compareRecords(a: ContactRecord, b: ContactRecord): number {
  const rankA = a.grade ? GRADE_RANK[a.grade] : 99;
  const rankB = b.grade ? GRADE_RANK[b.grade] : 99;
  if (rankA !== rankB) return rankA - rankB;
  const hopeA = a.analysis?.meetingIntent === "희망" ? 0 : 1;
  const hopeB = b.analysis?.meetingIntent === "희망" ? 0 : 1;
  if (hopeA !== hopeB) return hopeA - hopeB;
  if (a.contactId < b.contactId) return -1;
  if (a.contactId > b.contactId) return 1;
  return 0;
}

export function isAbCandidate(record: ContactRecord): boolean {
  return record.status === "완료" && (record.grade === "A" || record.grade === "B");
}
