import { describe, expect, it } from "vitest";
import { decodeCsvBytes, parseCrmCsv, recordsFromParsed } from "@/lib/csv";

const header = "접점ID,고객ID,세그먼트,요청유형,현장요청,관심제품,관심분야,참관목적,후속미팅희망,메모";

function parse(text: string) {
  return parseCrmCsv(text);
}

describe("CSV 파싱", () => {
  it("따옴표 안 쉼표, 줄바꿈, 한글, 빈 셀, 앞자리 0을 보존한다", () => {
    const text = [
      header,
      '007,00012,GPUBASE,자료,"제품소개서, 견적","",AI,"상담\n목적",,내부 메모',
      "",
    ].join("\n");
    const result = parse(text);
    expect(result.canRun).toBe(true);
    expect(result.dataRowCount).toBe(1);
    expect(result.rows[0]["접점ID"]).toBe("007");
    expect(result.rows[0]["고객ID"]).toBe("00012");
    expect(result.rows[0]["현장요청"]).toBe("제품소개서, 견적");
    expect(result.rows[0]["관심제품"]).toBe("");
    expect(result.rows[0]["참관목적"]).toBe("상담\n목적");
    expect(result.rows[0]["후속미팅희망"]).toBe("");
    expect(result.rows[0]["메모"]).toBe("내부 메모");
    expect(result.uniqueCustomerCount).toBe(1);
    expect(recordsFromParsed(result)[0].contactId).toBe("007");
  });

  it("UTF-8 BOM을 제거하고 헤더를 읽는다", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(`${header}\n001,1,,,,,,,\n`)]);
    const decoded = decodeCsvBytes(bytes);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const result = parse(decoded.text);
    expect(result.missingColumns).toEqual([]);
    expect(result.rows[0]["접점ID"]).toBe("001");
  });

  it("UTF-8이 아니면 저장 방법을 안내하고 실패한다", () => {
    const decoded = decodeCsvBytes(new Uint8Array([0xb0, 0xa1, 0x2c, 0x41]));
    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.error).toContain("UTF-8");
    expect(decoded.error).toContain("CSV UTF-8");
  });

  it("필수 열 누락과 접점ID 누락, 중복을 보여주고 실행을 막는다", () => {
    const missingColumn = parse("접점ID,고객ID\n001,1\n");
    expect(missingColumn.canRun).toBe(false);
    expect(missingColumn.missingColumns).toContain("현장요청");
    expect(missingColumn.blockReason).toContain("필수 열");

    const line = (id: string, customer: string) => [id, customer, "세그", "", "", "", "", "", "", ""].join(",");
    const badIds = parse([header, line("001", "1"), line("", "2"), line("001", "3")].join("\n"));
    expect(badIds.canRun).toBe(false);
    expect(badIds.missingIdRows.map((row) => row.index)).toEqual([2]);
    expect(badIds.duplicateIds).toEqual([{ contactId: "001", indexes: [1, 3] }]);
    expect(recordsFromParsed(badIds)).toEqual([]);
  });

  it("빈 행은 제외하고 빈 고객ID는 고유 고객 수에서 뺀다", () => {
    const line = (id: string, customer: string) => [id, customer, "세그", "", "", "", "", "", "", ""].join(",");
    const result = parse([header, line("001", ""), ",,,,,,,,,", line("002", "10")].join("\n"));
    expect(result.dataRowCount).toBe(2);
    expect(result.uniqueCustomerCount).toBe(1);
  });
});
