import "server-only";
import { GoogleGenAI } from "@google/genai";
import { GeminiCallError, mapProviderError, publicError } from "@/lib/gemini-error";
import { buildLabelPrompt } from "@/lib/prompt";
import { buildResponseJsonSchema } from "@/lib/response-schema";
import type { LabelContactInput } from "@/lib/types";

function finishReason(response: { candidates?: Array<{ finishReason?: string }> }): string | undefined {
  return response.candidates?.[0]?.finishReason;
}

export async function labelContacts(contacts: LabelContactInput[], model: string, apiKey: string): Promise<unknown> {
  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildLabelPrompt(contacts);
  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt.user,
      config: {
        systemInstruction: prompt.system,
        temperature: 0,
        responseMimeType: "application/json",
        responseJsonSchema: buildResponseJsonSchema(),
      },
    });
    const reason = finishReason(response);
    if (reason === "MAX_TOKENS") {
      throw publicError("OUTPUT_LIMIT", 422);
    }
    const text = response.text;
    if (!text) throw publicError("BAD_RESPONSE", 502);
    try {
      return JSON.parse(text);
    } catch {
      throw publicError("BAD_RESPONSE", 502);
    }
  } catch (error) {
    if (error instanceof GeminiCallError) throw error;
    throw mapProviderError(error, apiKey);
  }
}
