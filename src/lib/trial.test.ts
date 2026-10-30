import { describe, expect, it } from "vitest";
import type { AnalysisLabels } from "@/lib/types";
import {
  buildDraftPrompt,
  buildEml,
  draftFactsFromAnalysis,
  draftFactsSchema,
  draftResponseSchema,
  TRIAL_LINK,
  TRIAL_RECIPIENT,
  TRIAL_SUBJECT,
  TRIAL_TEMPLATE_BODY,
} from "@/lib/trial";

const analysis: AnalysisLabels = {
  contactPurposes: ["정보 탐색"],
  interestAreas: ["GPU 인프라"],
  workNeed: "회사소개서",
  reviewStages: ["탐색"],
  followUpRequests: ["자료"],
  meetingIntent: "미확인",
  reviewReasons: ["정보 부족"],
  evidence: [{ label: "정보 탐색", field: "현장요청", quote: "회사소개서" }],
  followUpQuestions: ["일정은 언제인가요?"],
};

describe("체험판 안내 메일", () => {
  it("시안 본문을 기본 템플릿으로 두고 링크 자리만 상수로 둔다", () => {
    expect(TRIAL_TEMPLATE_BODY).toContain("한화 갤러리 담당자님, 안녕하세요.");
    expect(TRIAL_TEMPLATE_BODY).toContain(`▶ 체험판 바로가기: ${TRIAL_LINK}`);
    expect(TRIAL_TEMPLATE_BODY).toContain("아크릴 영업팀 드림");
    expect(TRIAL_TEMPLATE_BODY).not.toContain("https://");
  });

  it("초안 입력은 해석 필드와 근거 인용만 담고 고객ID는 넣지 않는다", () => {
    const facts = draftFactsFromAnalysis(analysis);
    expect(draftFactsSchema.parse(facts)).toEqual({
      workNeed: "회사소개서",
      interestAreas: ["GPU 인프라"],
      followUpRequests: ["자료"],
      meetingIntent: "미확인",
      evidenceQuotes: ["회사소개서"],
    });
    expect(JSON.stringify(facts)).not.toContain("CUST");
    expect(buildDraftPrompt(facts).user).toBe(JSON.stringify(facts));
    expect(buildDraftPrompt(facts).system).toContain(TRIAL_RECIPIENT);
    expect(buildDraftPrompt(facts).system).toContain(TRIAL_SUBJECT);
  });

  it("링크 자리표시자가 없는 모델 응답은 거절한다", () => {
    expect(draftResponseSchema.safeParse({ subject: TRIAL_SUBJECT, body: "링크 없음" }).success).toBe(false);
    expect(draftResponseSchema.safeParse({ subject: TRIAL_SUBJECT, body: `안내 ${TRIAL_LINK}`, extra: 1 }).success).toBe(false);
  });

  it("eml에는 고정 수신처와 제목, 본문이 들어간다", () => {
    const eml = buildEml("본문");
    expect(eml).toContain("Content-Type: text/plain; charset=UTF-8");
    expect(eml.endsWith("본문")).toBe(true);
    expect(eml).not.toContain("CUST");
  });
});
