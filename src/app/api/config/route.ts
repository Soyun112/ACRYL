import { BATCH_SETTINGS, CRITERIA_VERSION } from "@/lib/criteria";
import { getGeminiConfig } from "@/server/env";

export const dynamic = "force-dynamic";

export function GET() {
  const config = getGeminiConfig();
  return Response.json({
    configured: config.configured,
    model: config.model || null,
    criteriaVersion: CRITERIA_VERSION,
    maxBatchSize: BATCH_SETTINGS.maxBatchSize,
  });
}
