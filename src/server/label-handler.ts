import { BATCH_SETTINGS, CRITERIA_VERSION } from "@/lib/criteria";
import { GeminiCallError, mapProviderError, publicError } from "@/lib/gemini-error";
import { matchResults } from "@/lib/validate";
import type { LabelContactInput } from "@/lib/types";
import { labelRequestSchema } from "@/server/label-contract";

export interface LabelHandlerDeps {
  configured: boolean;
  model: string;
  apiKey: string;
  label: (contacts: LabelContactInput[], model: string, apiKey: string) => Promise<unknown>;
}

export async function handleLabelRequest(
  raw: string,
  deps: LabelHandlerDeps,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!deps.configured || !deps.apiKey || !deps.model) {
    const error = publicError("CONFIG", 503);
    return { status: error.httpStatus, body: { code: error.code, message: error.message } };
  }
  if (raw.length > BATCH_SETTINGS.maxBodyChars) {
    return {
      status: 413,
      body: {
        code: "BAD_REQUEST",
        message: "요청이 너무 큽니다. 원문은 자르지 않았으며 이 묶음은 처리할 수 없습니다.",
      },
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    const error = publicError("BAD_REQUEST", 400);
    return { status: error.httpStatus, body: { code: error.code, message: error.message } };
  }

  const parsed = labelRequestSchema.safeParse(json);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path.join(".") ?? "";
    const error = publicError("BAD_REQUEST", 400);
    return {
      status: 400,
      body: {
        code: "BAD_REQUEST",
        message: path ? `${error.message} (${path})` : error.message,
      },
    };
  }

  try {
    const modelJson = await deps.label(parsed.data.contacts, deps.model, deps.apiKey);
    const results = matchResults(parsed.data.contacts, modelJson);
    return {
      status: 200,
      body: {
        model: deps.model,
        criteriaVersion: CRITERIA_VERSION,
        results,
      },
    };
  } catch (error) {
    const mapped = error instanceof GeminiCallError ? mapProviderError(error, deps.apiKey) : mapProviderError(error, deps.apiKey);
    return { status: mapped.httpStatus, body: { code: mapped.code, message: mapped.message } };
  }
}
