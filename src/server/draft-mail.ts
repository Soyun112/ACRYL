import "server-only";
import { GoogleGenAI } from "@google/genai";
import { GeminiCallError, mapProviderError, publicError } from "@/lib/gemini-error";
import {
  buildDraftPrompt,
  draftResponseSchema,
  DRAFT_TIMEOUT_MS,
  type DraftFacts,
} from "@/lib/trial";

function finishReason(response: { candidates?: Array<{ finishReason?: string }> }): string | undefined {
  return response.candidates?.[0]?.finishReason;
}

export async function draftTrialMail(facts: DraftFacts, model: string, apiKey: string): Promise<{ subject: string; body: string }> {
  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildDraftPrompt(facts);
  const request = ai.models.generateContent({
    model,
    contents: prompt.user,
    config: {
      systemInstruction: prompt.system,
      temperature: 0,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["subject", "body"],
        properties: {
          subject: { type: "string" },
          body: { type: "string" },
        },
      },
    },
  });
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(publicError("TRANSIENT", 504)), DRAFT_TIMEOUT_MS);
  });
  try {
    const response = await Promise.race([request, timeout]);
    const reason = finishReason(response);
    if (reason === "MAX_TOKENS") throw publicError("OUTPUT_LIMIT", 422);
    const text = response.text;
    if (!text) throw publicError("BAD_RESPONSE", 502);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw publicError("BAD_RESPONSE", 502);
    }
    const draft = draftResponseSchema.safeParse(parsed);
    if (!draft.success) throw publicError("BAD_RESPONSE", 502);
    return draft.data;
  } catch (error) {
    if (error instanceof GeminiCallError) throw error;
    throw mapProviderError(error, apiKey);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
