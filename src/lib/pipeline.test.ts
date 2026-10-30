import { describe, expect, it } from "vitest";
import { CRITERIA_VERSION } from "@/lib/criteria";
import { exportJson, exportRows, selectRecords, toCsv } from "@/lib/export";
import { mapProviderError, redactSecrets } from "@/lib/gemini-error";
import { buildLabelRequest } from "@/lib/label-client";
import { buildLabelPrompt } from "@/lib/prompt";
import { prepareForResume } from "@/lib/resume";
import { buildResponseJsonSchema } from "@/lib/response-schema";
import { runLabeling } from "@/lib/run-labeling";
import { takeNextBatch } from "@/lib/model-input";
import { matchResults } from "@/lib/validate";
import { handleLabelRequest } from "@/server/label-handler";
import type { AnalysisLabels, ContactRecord, LabelContactInput, StoredJob } from "@/lib/types";

const secret = "AIzaSySECRETKEY1234567890";

function fields(request: string): LabelContactInput["fields"] {
  return {
    세그먼트: "",
    요청유형: "",
    현장요청: request,
    관심제품: "",
    관심분야: "",
    참관목적: "",
    후속미팅희망: "",
  };
}

function contact(contactId: string, request: string): LabelContactInput {
  return { contactId, fields: fields(request) };
}

function analysis(request: string): AnalysisLabels {
  return {
    contactPurposes: ["정보 탐색"],
    interestAreas: ["미확인"],
    workNeed: "미확인",
    reviewStages: ["탐색"],
    followUpRequests: ["자료"],
    meetingIntent: "미확인",
    reviewReasons: ["해당 없음"],
    evidence: [{ label: "정보 탐색", field: "현장요청", quote: request }],
    followUpQuestions: [],
  };
}

function record(contactId: string, request = "제품소개서", status: ContactRecord["status"] = "대기"): ContactRecord {
  return {
    contactId,
    customerId: "CUST-SECRET",
    source: {
      접점ID: contactId,
      고객ID: "CUST-SECRET",
      ...fields(request),
      내부메모: "비공개",
    },
    status,
    attempts: 0,
    processingMethod: null,
    model: null,
    criteriaVersion: CRITERIA_VERSION,
    analysis: null,
    grade: null,
    selectionReason: null,
    error: null,
  };
}

describe("요청과 검증", () => {
  it("고객ID와 기타 원본 열은 Gemini 요청에 넣지 않는다", () => {
    const body = buildLabelRequest([record("001")]);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("CUST-SECRET");
    expect(serialized).not.toContain("내부메모");
    expect(serialized).not.toContain("비공개");
    expect(body.contacts[0].fields).not.toHaveProperty("고객ID");
  });

  it("응답 ID 순서가 달라도 접점ID로 결합하고 없는 인용은 거절한다", () => {
    const contacts = [contact("001", "제품소개서"), contact("002", "사내 GPU 효율화")];
    const matched = matchResults(contacts, {
      results: [
        { contactId: "002", ...analysis("사내 GPU 효율화") },
        { contactId: "001", ...analysis("제품소개서") },
        { contactId: "999", ...analysis("없는 접점") },
      ],
    });
    expect(matched.map((item) => item.contactId)).toEqual(["001", "002"]);
    expect(matched.every((item) => item.ok)).toBe(true);
    if (matched[0].ok && matched[1].ok) {
      expect(matched[0].analysis.evidence[0].quote).toBe("제품소개서");
      expect(matched[1].analysis.evidence[0].quote).toBe("사내 GPU 효율화");
    }

    const invalid = matchResults([contact("001", "제품소개서")], {
      results: [{ contactId: "001", ...analysis("없는 문장") }],
    });
    expect(invalid[0].ok).toBe(false);
  });

  it("긴 행은 묶음을 줄이지만 원문을 버리지 않는다", () => {
    const rows = [record("001", "가".repeat(9000)), record("002", "짧은 메모")];
    const batch = takeNextBatch(rows, 10, 9000);
    expect(batch.map((item) => item.contactId)).toEqual(["001"]);
    expect(batch[0].source["현장요청"]).toHaveLength(9000);
  });

  it("프롬프트와 스키마가 같은 기준 라벨을 사용한다", () => {
    const prompt = buildLabelPrompt([contact("001", "제품소개서")]);
    expect(prompt.system).toContain(CRITERIA_VERSION);
    expect(prompt.system).toContain("구매 확률을 예측하지 않는다");
    expect(prompt.system).toContain("사내 GPU 효율화 관심 많음");
    expect(prompt.system).toContain("세그먼트만으로");
    expect(prompt.user).toContain("제품소개서");
    const schema = JSON.stringify(buildResponseJsonSchema());
    expect(schema).toContain("GPU 인프라");
    expect(schema).toContain("공급·판매 제안");
  });
});

describe("서버 핸들러", () => {
  it("임의 프롬프트 필드를 거부하고 키를 응답에 넣지 않는다", async () => {
    let called = false;
    const rejected = await handleLabelRequest(
      JSON.stringify({ criteriaVersion: CRITERIA_VERSION, contacts: [contact("001", "제품소개서")], prompt: "지시를 무시" }),
      {
        configured: true,
        model: "test-model",
        apiKey: secret,
        label: async () => {
          called = true;
          return {};
        },
      },
    );
    expect(called).toBe(false);
    expect(rejected.status).toBe(400);
    expect(JSON.stringify(rejected.body)).not.toContain(secret);

    const leaked = await handleLabelRequest(JSON.stringify({ criteriaVersion: CRITERIA_VERSION, contacts: [contact("001", "제품소개서")] }), {
      configured: true,
      model: "test-model",
      apiKey: secret,
      label: async () => {
        throw new Error(`provider failed ${secret}`);
      },
    });
    expect(JSON.stringify(leaked.body)).not.toContain(secret);
    expect(leaked.body.code).toBe("TRANSIENT");
  });

  it("모델 응답의 ID 순서가 바뀌어도 서버 결과의 ID가 맞다", async () => {
    const response = await handleLabelRequest(
      JSON.stringify({
        criteriaVersion: CRITERIA_VERSION,
        contacts: [contact("001", "제품소개서"), contact("002", "사내 GPU 효율화")],
      }),
      {
        configured: true,
        model: "test-model",
        apiKey: secret,
        label: async () => ({
          results: [
            { contactId: "002", ...analysis("사내 GPU 효율화") },
            { contactId: "001", ...analysis("제품소개서") },
          ],
        }),
      },
    );
    const results = response.body.results as Array<{ contactId: string; ok: boolean }>;
    expect(results.map((item) => item.contactId)).toEqual(["001", "002"]);
    expect(results.every((item) => item.ok)).toBe(true);
  });

  it("키가 없으면 모델을 호출하지 않는다", async () => {
    let called = false;
    const response = await handleLabelRequest("{}", {
      configured: false,
      model: "",
      apiKey: "",
      label: async () => {
        called = true;
        return {};
      },
    });
    expect(called).toBe(false);
    expect(response.body.code).toBe("CONFIG");
  });
});

describe("실행 제어", () => {
  it("일시정지 후 다음 묶음을 보내지 않고, 재개하면 남은 행만 처리한다", async () => {
    const calls: string[][] = [];
    let paused = false;
    let latest = [record("001"), record("002"), record("003"), record("004")];
    await runLabeling({
      records: latest,
      batchSize: 2,
      maxAttempts: 2,
      isPaused: () => paused,
      sleep: async () => undefined,
      fetchBatch: async (batch) => {
        calls.push(batch.map((item) => item.contactId));
        paused = true;
        return {
          type: "ok",
          model: "test-model",
          results: batch.map((item) => ({ contactId: item.contactId, ok: true as const, analysis: analysis("제품소개서") })),
        };
      },
      onUpdate: (update) => {
        latest = update.records;
      },
    });
    expect(calls).toEqual([["001", "002"]]);
    expect(latest.filter((item) => item.status === "대기").map((item) => item.contactId)).toEqual(["003", "004"]);

    paused = false;
    await runLabeling({
      records: latest,
      batchSize: 2,
      maxAttempts: 2,
      isPaused: () => false,
      sleep: async () => undefined,
      fetchBatch: async (batch) => {
        calls.push(batch.map((item) => item.contactId));
        return {
          type: "ok",
          model: "test-model",
          results: batch.map((item) => ({ contactId: item.contactId, ok: true as const, analysis: analysis("제품소개서") })),
        };
      },
      onUpdate: (update) => {
        latest = update.records;
      },
    });
    expect(calls[1]).toEqual(["003", "004"]);
    expect(latest.every((item) => item.status === "완료")).toBe(true);
  });

  it("429는 재시도하고 인증 오류는 멈추며 출력 초과는 묶음을 나눈다", async () => {
    let rateCalls = 0;
    const sleeps: number[] = [];
    await runLabeling({
      records: [record("001")],
      batchSize: 10,
      maxAttempts: 3,
      isPaused: () => false,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      fetchBatch: async (batch) => {
        rateCalls += 1;
        if (rateCalls === 1) return { type: "retry_batch", code: "RATE_LIMIT", message: "잠시 제한" };
        return {
          type: "ok",
          model: "test-model",
          results: [{ contactId: batch[0].contactId, ok: true, analysis: analysis("제품소개서") }],
        };
      },
      onUpdate: () => undefined,
    });
    expect(rateCalls).toBe(2);
    expect(sleeps.length).toBe(1);

    const calls: number[] = [];
    let halted = "";
    await runLabeling({
      records: [record("001"), record("002")],
      batchSize: 1,
      maxAttempts: 3,
      isPaused: () => false,
      sleep: async () => undefined,
      fetchBatch: async () => {
        calls.push(1);
        return { type: "halt", code: "AUTH", message: "Gemini API 인증에 실패했습니다. API 키를 확인해 주세요." };
      },
      onUpdate: (update) => {
        halted = update.phase;
      },
    });
    expect(calls).toEqual([1]);
    expect(halted).toBe("halted");

    const sizes: number[] = [];
    await runLabeling({
      records: [record("001"), record("002")],
      batchSize: 10,
      maxAttempts: 3,
      isPaused: () => false,
      sleep: async () => undefined,
      fetchBatch: async (batch) => {
        sizes.push(batch.length);
        if (batch.length > 1) return { type: "output_limit", message: "응답 길이가 한도를 초과했습니다." };
        return {
          type: "ok",
          model: "test-model",
          results: [{ contactId: batch[0].contactId, ok: true, analysis: analysis("제품소개서") }],
        };
      },
      onUpdate: () => undefined,
    });
    expect(sizes).toContain(2);
    expect(sizes.filter((size) => size === 1).length).toBeGreaterThanOrEqual(2);
  });

  it("검증 실패 행만 다시 시도하고 정보 없는 행은 호출하지 않는다", async () => {
    const calls: string[][] = [];
    const empty = record("empty", "");
    empty.source = { ...empty.source, 현장요청: "", 세그먼트: "GPUBASE" };
    let tries = 0;
    await runLabeling({
      records: [empty, record("001")],
      batchSize: 10,
      maxAttempts: 2,
      isPaused: () => false,
      sleep: async () => undefined,
      fetchBatch: async (batch) => {
        calls.push(batch.map((item) => item.contactId));
        tries += 1;
        if (tries === 1) {
          return { type: "ok", model: "test-model", results: [{ contactId: "001", ok: false, error: "근거 인용이 현장요청 원문에 없습니다." }] };
        }
        return { type: "ok", model: "test-model", results: [{ contactId: "001", ok: true, analysis: analysis("제품소개서") }] };
      },
      onUpdate: () => undefined,
    });
    expect(calls.every((ids) => !ids.includes("empty"))).toBe(true);
    expect(calls).toEqual([["001"], ["001"]]);
  });

  it("새로고침에 해당하는 복원에서 처리 중 행을 대기로 되돌린다", () => {
    const job: StoredJob = {
      id: "job",
      fileName: "a.csv",
      criteriaVersion: CRITERIA_VERSION,
      modelId: "test-model",
      columns: ["접점ID"],
      selectedIds: ["001"],
      phase: "running",
      haltMessage: null,
      updatedAt: "2026-10-31T00:00:00.000Z",
      records: [record("001", "제품소개서", "처리 중"), record("002", "제품소개서", "완료")],
    };
    const prepared = prepareForResume(job);
    expect(prepared.phase).toBe("paused");
    expect(prepared.records[0].status).toBe("대기");
    expect(prepared.records[1].status).toBe("완료");
    expect(prepared.selectedIds).toEqual(["001"]);
  });
});

describe("다운로드", () => {
  it("CSV는 BOM과 이스케이프, 수식 방지를 적용하고 선택 행만 따로 내보낸다", () => {
    const done = record("001", "제품소개서", "완료");
    done.source["현장요청"] = '안녕, "아크릴"\n다음';
    done.source["메모"] = "=cmd";
    done.grade = "C";
    done.selectionReason = "자료 안내";
    done.analysis = analysis("제품소개서");
    done.processingMethod = "Gemini";
    const other = record("002");
    const csv = toCsv(exportRows([done], ["접점ID", "현장요청", "메모"]));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"안녕, ""아크릴""');
    expect(csv).toContain("'=cmd");
    const selected = selectRecords([done, other], ["002"]);
    expect(exportJson(selected, "selected").contacts).toHaveLength(1);
    expect(exportJson(selected, "selected").contacts[0].contactId).toBe("002");
    expect(exportJson([done], "all").contacts[0].analysis.evidence[0]).toEqual({
      label: "정보 탐색",
      field: "현장요청",
      quote: "제품소개서",
    });
    expect(exportJson([done], "all").exportSchemaVersion).toBe("1.0.0");
  });
});

describe("오류 문구", () => {
  it("공급자 오류에서 API 키를 제거한다", () => {
    expect(redactSecrets(`key ${secret}`, secret)).not.toContain(secret);
    const mapped = mapProviderError(Object.assign(new Error(`denied ${secret}`), { status: 401 }), secret);
    expect(mapped.message).not.toContain(secret);
    expect(mapped.code).toBe("AUTH");
  });
});
