import { permanentRedirect } from "next/navigation";

// Dokumenty moved under Účastníci (/events/[id]/participants/documents); old links keep working.
export default async function OldDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  permanentRedirect(`/events/${(await params).id}/participants/documents`);
}
