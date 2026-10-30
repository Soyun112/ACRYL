import { handleLabelRequest } from "@/server/label-handler";
import { getGeminiConfig } from "@/server/env";
import { labelContacts } from "@/server/gemini";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const raw = await request.text();
  const config = getGeminiConfig();
  const result = await handleLabelRequest(raw, {
    configured: config.configured,
    model: config.model,
    apiKey: config.apiKey,
    label: labelContacts,
  });
  return Response.json(result.body, { status: result.status });
}
