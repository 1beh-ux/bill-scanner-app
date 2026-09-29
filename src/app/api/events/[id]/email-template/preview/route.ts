import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { modulesForEmailPurpose, senderIdentity } from "@/lib/email-template";
import {
  MAIL_HELPER_BULK_STATUS_PURPOSE_KEY,
  PARENT_SUMMARY_PURPOSE_KEY,
  REGISTRATION_ACCEPTANCE_PURPOSE_KEY,
} from "@/lib/email-template-purpose-keys";
import { previewParticipantEmail } from "@/lib/participant-bulk-email";
import { previewBulkStatusEmail } from "@/lib/mail-bulk-status-send";
import { resolveEmailPreview } from "@/lib/parent-email-send";

// Nastavení akce template editors: the template being edited, filled in for
// one real participant of this event by the same code its send uses.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const body = await req.json().catch(() => ({}));
  const purposeKey = typeof body.purposeKey === "string" ? body.purposeKey : "";
  const denied = await requireAnyModuleAccess(user, eventId, modulesForEmailPurpose(purposeKey));
  if (denied) return denied;

  const participantId = typeof body.participantId === "string" ? body.participantId : "";
  const template = { subject: typeof body.subject === "string" ? body.subject : "", body: typeof body.body === "string" ? body.body : "" };

  let preview: { subject: string; body: string } | null = null;
  if (purposeKey === MAIL_HELPER_BULK_STATUS_PURPOSE_KEY) {
    preview = await previewBulkStatusEmail(eventId, participantId, user.id, template);
  } else if (purposeKey === PARENT_SUMMARY_PURPOSE_KEY) {
    preview = await resolveEmailPreview(participantId, senderIdentity(user, "Zdravotník"), template).catch(() => null);
  } else {
    // Acceptance (documents as their default ticks) and the open e-mail.
    preview = await previewParticipantEmail({
      eventId,
      participantId,
      ...template,
      sentByUserId: user.id,
      markAccepted: purposeKey === REGISTRATION_ACCEPTANCE_PURPOSE_KEY,
    });
  }
  if (!preview) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(preview);
}
