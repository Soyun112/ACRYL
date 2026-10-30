import Papa from "papaparse";
import { CRITERIA_VERSION, CUSTOMER_ID_FIELD, REQUIRED_COLUMNS, CONTACT_ID_FIELD } from "@/lib/criteria";
import { isBlank } from "@/lib/text";
import type { ContactRecord } from "@/lib/types";

export interface CsvIssueRow {
  index: number;
  contactId: string;
  customerId: string;
  snippet: string;
}

export interface DuplicateIdGroup {
  contactId: string;
  indexes: number[];
}

export interface ParsedCsv {
  columns: string[];
  rows: Record<string, string>[];
  dataRowCount: number;
  uniqueCustomerCount: number;
  blankCounts: { field: string; blank: number; total: number }[];
  missingColumns: string[];
  missingIdRows: CsvIssueRow[];
  duplicateIds: DuplicateIdGroup[];
  parseErrors: { message: string; row?: number }[];
  preview: Record<string, string>[];
  canRun: boolean;
  blockReason: string | null;
}

const ENCODING_ERROR =
  "이 파일은 UTF-8로 읽지 못했습니다. Excel에서 다른 이름으로 저장할 때 'CSV UTF-8(쉼표로 분리)' 형식을 선택한 뒤 다시 업로드해 주세요.";

export function decodeCsvBytes(bytes: Uint8Array): { ok: true; text: string } | { ok: false; error: string } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
    return { ok: true, text };
  } catch {
    return { ok: false, error: ENCODING_ERROR };
  }
}

function cell(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

function snippetOf(row: Record<string, string>): string {
  const text = row["현장요청"] || row["요청유형"] || row["참관목적"] || "";
  return text.replace(/\s+/g, " ").slice(0, 80);
}

export function parseCrmCsv(text: string): ParsedCsv {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
  });
  const columns = (parsed.meta.fields ?? []).map((field) => field.replace(/^\uFEFF/, "").trim());
  const rows = parsed.data
    .map((row) => {
      const record: Record<string, string> = {};
      for (const column of columns) record[column] = cell(row[column]);
      return record;
    })
    .filter((row) => Object.values(row).some((value) => !isBlank(value)));

  const missingColumns = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
  const parseErrors = parsed.errors.map((error) => ({
    message: error.message,
    row: typeof error.row === "number" ? error.row : undefined,
  }));

  const idBuckets = new Map<string, number[]>();
  const missingIdRows: CsvIssueRow[] = [];
  rows.forEach((row, position) => {
    const index = position + 1;
    const contactId = (row[CONTACT_ID_FIELD] ?? "").trim();
    if (!contactId) {
      missingIdRows.push({
        index,
        contactId: "",
        customerId: row[CUSTOMER_ID_FIELD] ?? "",
        snippet: snippetOf(row),
      });
      return;
    }
    const bucket = idBuckets.get(contactId) ?? [];
    bucket.push(index);
    idBuckets.set(contactId, bucket);
  });
  const duplicateIds: DuplicateIdGroup[] = [...idBuckets.entries()]
    .filter(([, indexes]) => indexes.length > 1)
    .map(([contactId, indexes]) => ({ contactId, indexes }));

  const customers = new Set<string>();
  for (const row of rows) {
    const customerId = (row[CUSTOMER_ID_FIELD] ?? "").trim();
    if (customerId) customers.add(customerId);
  }

  const blankCounts = columns.map((field) => ({
    field,
    blank: rows.filter((row) => isBlank(row[field])).length,
    total: rows.length,
  }));

  let blockReason: string | null = null;
  if (missingColumns.length > 0) {
    blockReason = `필수 열이 없습니다: ${missingColumns.join(", ")}`;
  } else if (parseErrors.length > 0) {
    blockReason = "CSV 파싱 오류가 있어 라벨링을 시작할 수 없습니다.";
  } else if (missingIdRows.length > 0 || duplicateIds.length > 0) {
    blockReason = "접점ID가 비어 있거나 중복된 행이 있습니다. 해당 행을 수정한 뒤 다시 업로드해 주세요.";
  } else if (rows.length === 0) {
    blockReason = "라벨링할 데이터 행이 없습니다.";
  }

  return {
    columns,
    rows,
    dataRowCount: rows.length,
    uniqueCustomerCount: customers.size,
    blankCounts,
    missingColumns,
    missingIdRows,
    duplicateIds,
    parseErrors,
    preview: rows.slice(0, 10),
    canRun: blockReason === null,
    blockReason,
  };
}

export function recordsFromParsed(parsed: ParsedCsv): ContactRecord[] {
  if (!parsed.canRun) return [];
  return parsed.rows.map((row) => ({
    contactId: row[CONTACT_ID_FIELD].trim(),
    customerId: (row[CUSTOMER_ID_FIELD] ?? "").trim(),
    source: row,
    status: "대기",
    attempts: 0,
    processingMethod: null,
    model: null,
    criteriaVersion: CRITERIA_VERSION,
    analysis: null,
    grade: null,
    selectionReason: null,
    error: null,
  }));
}
