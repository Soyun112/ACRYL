import { draftFactsSchema } from "@/lib/trial";
import { getGeminiConfig } from "@/server/env";
import { draftTrialMail } from "@/server/draft-mail";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const facts = draftFactsSchema.safeParse(payload);
  if (!facts.success) return Response.json({ ok: false }, { status: 400 });
  const config = getGeminiConfig();
  if (!config.configured) return Response.json({ ok: false }, { status: 200 });
  try {
    const draft = await draftTrialMail(facts.data, config.model, config.apiKey);
    return Response.json({ ok: true, subject: draft.subject, body: draft.body });
  } catch {
    return Response.json({ ok: false }, { status: 200 });
  }
}
