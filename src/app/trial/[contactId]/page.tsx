import { TrialDraftPage } from "@/components/trial-draft-page";

export default async function Page({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  return <TrialDraftPage contactId={contactId} />;
}
