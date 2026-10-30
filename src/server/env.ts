import "server-only";

export function getGeminiConfig() {
  const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  const model = process.env.GEMINI_MODEL?.trim() ?? "";
  return {
    apiKey,
    model,
    configured: apiKey.length > 0 && model.length > 0,
  };
}
