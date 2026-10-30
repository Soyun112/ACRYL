import { describe, expect, it } from "vitest";
import { applyPendingRuleRows, isRuleEmpty } from "@/lib/empty-row";
import { compareRecords, gradeAnalysis } from "@/lib/grade";
import type { AnalysisLabels, ContactRecord } from "@/lib/types";

function labels(partial: Partial<AnalysisLabels> = {}): AnalysisLabels {
  return {
    contactPurposes: ["미확인"],
    interestAreas: ["미확인"],
    workNeed: "미확인",
    reviewStages: ["미확인"],
    followUpRequests: ["미확인"],
    meetingIntent: "미확인",
    reviewReasons: ["해당 없음"],
    evidence: [],
    followUpQuestions: [],
    ...partial,
  };
}

function row(contactId: string, grade: ContactRecord["grade"], meeting: AnalysisLabels["meetingIntent"]): ContactRecord {
  return {
    contactId,
    customerId: "",
    source: {},
    status: "완료",
    attempts: 1,
    processingMethod: "Gemini",
    model: "test-model",
    criteriaVersion: "1.0.0",
    analysis: labels({ meetingIntent: meeting }),
    grade,
    selectionReason: "",
    error: null,
  };
}

describe("후보 등급", () => {
  it("내용 충돌, 미팅 충돌, 처리 실패는 검토다", () => {
    expect(gradeAnalysis({ labels: labels({ reviewReasons: ["내용 충돌"] }) }).grade).toBe("검토");
    expect(gradeAnalysis({ labels: labels({ meetingIntent: "충돌" }) }).grade).toBe("검토");
    expect(gradeAnalysis({ labels: labels(), failed: true, failureMessage: "검증 실패" }).grade).toBe("검토");
  });

  it("자사 도입 없이 협업·공급·투자면 D이고, 자사 도입이 함께 있으면 아래 규칙으로 간다", () => {
    expect(gradeAnalysis({ labels: labels({ contactPurposes: ["협업"] }) }).grade).toBe("D");
    expect(gradeAnalysis({ labels: labels({ contactPurposes: ["공급·판매 제안"] }) }).grade).toBe("D");
    expect(gradeAnalysis({ labels: labels({ contactPurposes: ["투자", "협업"] }) }).grade).toBe("D");
    const both = gradeAnalysis({
      labels: labels({
        contactPurposes: ["자사 도입", "협업"],
        workNeed: "사내 GPU 활용 효율 개선",
        reviewStages: ["도입 계획"],
      }),
    });
    expect(both.grade).toBe("A");
  });

  it("업무 요구와 도입·체험 신호가 있으면 A이고 미팅 빈칸으로 등급이 내려가지 않는다", () => {
    expect(
      gradeAnalysis({
        labels: labels({ contactPurposes: ["자사 도입"], workNeed: "사내 GPU 활용 효율 개선" }),
      }).grade,
    ).toBe("A");
    expect(
      gradeAnalysis({
        labels: labels({ workNeed: "사내 GPU 활용 효율 개선", reviewStages: ["PoC 검토"] }),
      }).grade,
    ).toBe("A");
    expect(
      gradeAnalysis({
        labels: labels({ workNeed: "사내 GPU 활용 효율 개선", reviewStages: ["운영 개선"], meetingIntent: "미확인" }),
      }).grade,
    ).toBe("A");
    expect(
      gradeAnalysis({
        labels: labels({ workNeed: "데모 환경 확인", followUpRequests: ["체험"] }),
      }).grade,
    ).toBe("A");
  });

  it("A가 아니면 관심·도입 의사·견적·체험·미팅은 B, 정보 탐색·자료는 C, 나머지는 U다", () => {
    expect(gradeAnalysis({ labels: labels({ interestAreas: ["GPU 인프라"] }) }).grade).toBe("B");
    expect(gradeAnalysis({ labels: labels({ contactPurposes: ["자사 도입"] }) }).grade).toBe("B");
    expect(gradeAnalysis({ labels: labels({ followUpRequests: ["견적"] }) }).grade).toBe("B");
    expect(gradeAnalysis({ labels: labels({ meetingIntent: "희망" }) }).grade).toBe("B");
    expect(gradeAnalysis({ labels: labels({ contactPurposes: ["정보 탐색"] }) }).grade).toBe("C");
    expect(gradeAnalysis({ labels: labels({ followUpRequests: ["자료"] }) }).grade).toBe("C");
    expect(gradeAnalysis({ labels: labels() }).grade).toBe("U");
  });

  it("세그먼트만 있는 행은 API 없이 미확인과 U다", () => {
    const source = {
      세그먼트: "GPUBASE",
      요청유형: "",
      현장요청: "",
      관심제품: "",
      관심분야: "",
      참관목적: "",
      후속미팅희망: "",
    };
    expect(isRuleEmpty(source)).toBe(true);
    const [record] = applyPendingRuleRows([
      {
        contactId: "001",
        customerId: "10",
        source,
        status: "대기",
        attempts: 0,
        processingMethod: null,
        model: null,
        criteriaVersion: "1.0.0",
        analysis: null,
        grade: null,
        selectionReason: null,
        error: null,
      },
    ]);
    expect(record.processingMethod).toBe("규칙: 정보 없음");
    expect(record.analysis?.interestAreas).toEqual(["미확인"]);
    expect(record.analysis?.workNeed).toBe("미확인");
    expect(record.grade).toBe("U");
    expect(record.model).toBeNull();
  });

  it("A, B, C, D, U, 검토 순이고 같은 등급에서는 미팅 희망을 앞에 둔다", () => {
    const sorted = [
      row("010", "U", "미확인"),
      row("002", "A", "미확인"),
      row("001", "A", "희망"),
      row("003", "검토", "미확인"),
      row("004", "D", "희망"),
      row("005", "C", "미확인"),
      row("006", "B", "미확인"),
    ].sort(compareRecords);
    expect(sorted.map((record) => record.contactId)).toEqual(["001", "002", "006", "005", "004", "010", "003"]);
  });
});
