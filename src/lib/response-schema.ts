import {
  ANALYSIS_FIELDS,
  CONTACT_PURPOSES,
  EVIDENCE_LABELS,
  FOLLOW_UP_REQUESTS,
  INTEREST_AREAS,
  MEETING_INTENTS,
  REVIEW_REASONS,
  REVIEW_STAGES,
} from "@/lib/criteria";

export function buildResponseJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["results"],
    properties: {
      results: {
        type: "array",
        description: "입력 접점마다 하나의 결과. 순서가 아니라 contactId로 대응한다.",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "contactId",
            "contactPurposes",
            "interestAreas",
            "workNeed",
            "reviewStages",
            "followUpRequests",
            "meetingIntent",
            "reviewReasons",
            "evidence",
            "followUpQuestions",
          ],
          properties: {
            contactId: { type: "string", description: "입력 접점ID와 같은 값" },
            contactPurposes: {
              type: "array",
              description: "접촉목적. 구체적인 값이 있으면 미확인을 함께 넣지 않는다.",
              items: { type: "string", enum: [...CONTACT_PURPOSES] },
            },
            interestAreas: {
              type: "array",
              description: "관심분야. 세그먼트만으로 확정하지 않는다.",
              items: { type: "string", enum: [...INTEREST_AREAS] },
            },
            workNeed: {
              type: "string",
              description: "원문에 근거한 업무 요구 한 문장. 없으면 미확인.",
            },
            reviewStages: {
              type: "array",
              description: "검토단계",
              items: { type: "string", enum: [...REVIEW_STAGES] },
            },
            followUpRequests: {
              type: "array",
              description: "실제 후속 요청",
              items: { type: "string", enum: [...FOLLOW_UP_REQUESTS] },
            },
            meetingIntent: {
              type: "string",
              enum: [...MEETING_INTENTS],
              description: "미팅의사 단일 값",
            },
            reviewReasons: {
              type: "array",
              description: "검토사유. 해당 없음은 다른 사유와 함께 넣지 않는다.",
              items: { type: "string", enum: [...REVIEW_REASONS] },
            },
            evidence: {
              type: "array",
              description: "라벨별 원문 인용. quote는 해당 field 원문에 그대로 포함되어야 한다.",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["label", "field", "quote"],
                properties: {
                  label: { type: "string", enum: [...EVIDENCE_LABELS] },
                  field: { type: "string", enum: [...ANALYSIS_FIELDS] },
                  quote: { type: "string" },
                },
              },
            },
            followUpQuestions: {
              type: "array",
              maxItems: 2,
              description: "맞춤 제안에 필요한 미확인 내용만 최대 2개 질문한다.",
              items: { type: "string" },
            },
          },
        },
      },
    },
  };
}
