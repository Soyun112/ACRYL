import { CRITERIA_VERSION } from "@/lib/criteria";
import { toLabelInput } from "@/lib/model-input";
import type { FetchOutcome } from "@/lib/run-labeling";
import type { ContactRecord, LabelItemResult } from "@/lib/types";

interface ErrorBody {
  code?: string;
  message?: string;
  model?: string;
  results?: LabelItemResult[];
}

export function interpretLabelResponse(status: number, payload: unknown): FetchOutcome {
  const body = payload && typeof payload === "object" ? (payload as ErrorBody) : null;
  const message = body?.message || "라벨링 요청이 실패했습니다.";
  if (status >= 200 && status < 300) {
    if (!body?.model || !Array.isArray(body.results)) {
      return { type: "retry_batch", code: "BAD_RESPONSE", message: "응답 형식이 올바르지 않습니다." };
    }
    return { type: "ok", model: body.model, results: body.results };
  }
  if (body?.code === "AUTH") return { type: "halt", code: "AUTH", message };
  if (body?.code === "QUOTA") return { type: "halt", code: "QUOTA", message };
  if (body?.code === "CONFIG") return { type: "halt", code: "CONFIG", message };
  if (body?.code === "OUTPUT_LIMIT") return { type: "output_limit", message };
  if (body?.code === "RATE_LIMIT" || status === 429) {
    return { type: "retry_batch", code: "RATE_LIMIT", message };
  }
  if (body?.code === "BAD_RESPONSE" || body?.code === "TRANSIENT" || status >= 500) {
    return { type: "retry_batch", code: body?.code === "BAD_RESPONSE" ? "BAD_RESPONSE" : "TRANSIENT", message };
  }
  return { type: "fail_batch", message };
}

export function buildLabelRequest(records: ContactRecord[]) {
  return {
    criteriaVersion: CRITERIA_VERSION,
    contacts: records.map(toLabelInput),
  };
}

export async function requestLabelBatch(records: ContactRecord[]): Promise<FetchOutcome> {
  const response = await fetch("/api/label", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildLabelRequest(records)),
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return interpretLabelResponse(response.status, payload);
}
