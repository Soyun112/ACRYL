import { TRIAL_TEMPLATE_BODY } from "@/lib/trial";

export type DraftSource = "gemini" | "template";

export interface StoredTrialDraft {
  body: string;
  source: DraftSource;
}

const PREFIX = "acryl-trial-draft:";

export function trialDraftKey(contactId: string): string {
  return `${PREFIX}${contactId}`;
}

export function loadTrialDraft(contactId: string): StoredTrialDraft | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(trialDraftKey(contactId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredTrialDraft>;
    if (parsed.source !== "gemini" && parsed.source !== "template") return null;
    if (typeof parsed.body !== "string" || parsed.body.length === 0) return null;
    return { body: parsed.body, source: parsed.source };
  } catch {
    return null;
  }
}

export function saveTrialDraft(contactId: string, draft: StoredTrialDraft): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(trialDraftKey(contactId), JSON.stringify(draft));
}

export function clearTrialDraft(contactId: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(trialDraftKey(contactId));
}

export function templateDraft(): StoredTrialDraft {
  return { body: TRIAL_TEMPLATE_BODY, source: "template" };
}
