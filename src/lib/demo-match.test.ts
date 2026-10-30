import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import catalogFile from "../../data/demo-analysis.json";
import { ANALYSIS_FIELDS, DEMO_METHOD } from "@/lib/criteria";
import { parseCrmCsv, recordsFromParsed } from "@/lib/csv";
import {
  applyDemoMatches,
  demoCatalogSchema,
  expectedGradeLabel,
  matchDemoRows,
  normalizeMatchText,
  type DemoCatalog,
} from "@/lib/demo-match";
import { EMPTY_FILTERS, filterRecords } from "@/lib/filter";
import type { ContactRecord } from "@/lib/types";

const catalog = demoCatalogSchema.parse(catalogFile);

function rowFromResult(result: DemoCatalog["results"][number], contactId = result.contactId) {
  return { contactId, fields: result.input };
}

function recordFor(result: DemoCatalog["results"][number], customerId = "CSV-CUSTOMER"): ContactRecord {
  return {
    contactId: result.contactId,
    customerId,
    source: { ...result.input, 접점ID: result.contactId, 고객ID: customerId, 기타메모: "원본 유지" },
    status: "대기",
    attempts: 0,
    processingMethod: null,
    model: null,
    criteriaVersion: "1.0.0",
    analysis: null,
    grade: null,
    selectionReason: null,
    error: null,
  };
}

describe("시연 결과 대조", () => {
  it("빈 값은 빈 문자열로, 줄바꿈은 LF로 맞춘다", () => {
    expect(normalizeMatchText("  \r\n ")).toBe("");
    expect(normalizeMatchText(null)).toBe("");
    expect(normalizeMatchText("회사소개서\r\n다음")).toBe("회사소개서\n다음");
  });

  it("접점ID와 입력 7칸이 모두 같을 때만 결과를 붙인다", () => {
    expect(catalog.matchingFields).toEqual([...ANALYSIS_FIELDS]);
    expect(catalog.provenance.displayLabel).toBe("원문 기반 시연용 분류");
    const matches = matchDemoRows(catalog, catalog.results.map((result) => rowFromResult(result)));
    expect(matches.every((match) => match.matched)).toBe(true);
    expect(catalog.results.every((result) => result.score === null)).toBe(true);
    expect(catalog.results.every((result) => result.gradeLabel === expectedGradeLabel(result.grade))).toBe(true);
    for (const result of catalog.results) {
      for (const item of result.labels.판단근거) {
        expect(normalizeMatchText(result.input[item.field])).toContain(item.quote);
      }
    }

    const sample = catalog.results[0];
    const applied = applyDemoMatches([recordFor(sample)], matchDemoRows(catalog, [rowFromResult(sample)]), catalog.criteriaVersion);
    expect(applied[0].customerId).toBe("CSV-CUSTOMER");
    expect(applied[0].source["기타메모"]).toBe("원본 유지");
    expect(applied[0].status).toBe("완료");
    expect(applied[0].processingMethod).toBe(DEMO_METHOD);
    expect(applied[0].model).toBeNull();
    expect(applied[0].grade).toBe(sample.grade);
    expect(applied[0].selectionReason).toBe(sample.reason);
    expect(applied[0].analysis?.contactPurposes).toEqual(sample.labels.접촉목적);
    expect(applied[0].analysis?.followUpQuestions).toEqual(sample.labels.추가확인사항);
    expect(applied[0].analysis?.evidence.map((item) => item.quote)).toEqual(sample.labels.판단근거.map((item) => item.quote));
    expect("score" in applied[0]).toBe(false);
  });

  it("칸이 다르거나 접점ID가 다르면 다른 행의 결과를 넣지 않는다", () => {
    const sample = catalog.results[0];
    const changed = {
      contactId: sample.contactId,
      fields: { ...sample.input, 현장요청: `${sample.input.현장요청} 다른 문장` },
    };
    const otherId = { contactId: "없는ID", fields: sample.input };
    const crlf = {
      contactId: sample.contactId,
      fields: { ...sample.input, 현장요청: sample.input.현장요청.replace(/\n/g, "\r\n") },
    };
    const matches = matchDemoRows(catalog, [changed, otherId, crlf]);
    expect(matches[0]).toEqual({ contactId: sample.contactId, matched: false });
    expect(matches[1]).toEqual({ contactId: "없는ID", matched: false });
    expect(matches[2].matched).toBe(true);

    const applied = applyDemoMatches([recordFor(sample)], [matches[0]], catalog.criteriaVersion);
    expect(applied[0].status).toBe("저장 결과 없음");
    expect(applied[0].grade).toBeNull();
    expect(applied[0].analysis).toBeNull();
    expect(applied[0].customerId).toBe("CSV-CUSTOMER");
  });

  it("같은 키가 두 번 있으면 어느 결과도 붙이지 않는다", () => {
    const sample = catalog.results[0];
    const duplicated = { ...catalog, results: [sample, { ...sample }] };
    const [match] = matchDemoRows(duplicated, [rowFromResult(sample)]);
    expect(match).toEqual({ contactId: sample.contactId, matched: false });
  });

  it("등급 순으로 정렬하고 같은 등급에서는 미팅 희망을 앞에 둔다", () => {
    const records = applyDemoMatches(
      catalog.results.map((result) => recordFor(result, result.customerId)),
      matchDemoRows(catalog, catalog.results.map((result) => rowFromResult(result))),
      catalog.criteriaVersion,
    );
    const sorted = filterRecords(records, EMPTY_FILTERS);
    const ranks = sorted.map((record) => record.grade);
    const order = ["A", "B", "C", "D", "U", "검토"];
    let last = -1;
    for (const grade of ranks) {
      const index = order.indexOf(grade ?? "");
      expect(index).toBeGreaterThanOrEqual(last);
      last = index;
    }
    for (const grade of order) {
      const group = sorted.filter((record) => record.grade === grade);
      const firstUnhoped = group.findIndex((record) => record.analysis?.meetingIntent !== "희망");
      if (firstUnhoped === -1) continue;
      expect(group.slice(firstUnhoped).every((record) => record.analysis?.meetingIntent !== "희망")).toBe(true);
    }
  });

  it("샘플 CSV가 있으면 저장된 30건과 맞는다", () => {
    expect(catalog.results).toHaveLength(30);
    const samplePath = path.join(process.cwd(), "접점_샘플30.csv");
    if (!existsSync(samplePath)) return;
    const parsed = parseCrmCsv(readFileSync(samplePath, "utf8").replace(/^\uFEFF/, ""));
    expect(parsed.canRun).toBe(true);
    const records = recordsFromParsed(parsed);
    const matches = matchDemoRows(
      catalog,
      records.map((record) => ({
        contactId: record.contactId,
        fields: {
          세그먼트: record.source["세그먼트"] ?? "",
          요청유형: record.source["요청유형"] ?? "",
          현장요청: record.source["현장요청"] ?? "",
          관심제품: record.source["관심제품"] ?? "",
          관심분야: record.source["관심분야"] ?? "",
          참관목적: record.source["참관목적"] ?? "",
          후속미팅희망: record.source["후속미팅희망"] ?? "",
        },
      })),
    );
    const applied = applyDemoMatches(records, matches, catalog.criteriaVersion);
    expect(applied.filter((record) => record.status === "완료")).toHaveLength(catalog.results.length);
    expect(applied.filter((record) => record.grade === "A")).toHaveLength(
      catalog.results.filter((result) => result.grade === "A").length,
    );
    expect(applied.every((record) => record.customerId === record.source["고객ID"].trim())).toBe(true);
  });
});
