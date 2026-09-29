import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { getActiveDocumentTypes, getReceivedItemIds } from "@/lib/mail-helper-context";
import { resolveEmailTemplate, MAIL_HELPER_BULK_STATUS_PURPOSE_KEY } from "@/lib/email-template";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

// Mirrors the old app's api_prepareBulk -- one row per active participant (not just
// ones with a valid recipient, Part 8: a participant with no deliverable e-mail is
// shown, flagged, and simply not preselected, rather than silently vanishing from
// the list), per-document-type received/missing, defaultSend = not fully complete
// AND has at least one receivesCommunications guardian with a syntactically valid
// address, plus the raw template (filled in per participant by the page).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "mail");
  if (denied) return denied;

  const documentTypes = await getActiveDocumentTypes(eventId);
  const participants = await prisma.participant.findMany({
    where: { eventId, active: true },
    select: { id: true, name: true, guardians: { where: { receivesCommunications: true }, select: { email: true } } },
    orderBy: { name: "asc" },
  });

  const rows = await Promise.all(
    participants.map(async (p) => {
      const receivedItemIds = await getReceivedItemIds(p.id);
      const allComplete = documentTypes.every((d) => receivedItemIds.has(d.id));
      const recipientEmails = p.guardians.map((g) => g.email).filter((e) => EMAIL_RE.test(e));
      return {
        participantId: p.id,
        participantName: p.name,
        allComplete,
        recipientEmails,
        defaultSend: !allComplete && recipientEmails.length > 0,
        documents: documentTypes.map((d) => ({ eventListItemId: d.id, received: receivedItemIds.has(d.id) })),
      };
    })
  );

  // The raw template; the page fills it in per participant via
  // /api/events/[id]/email-template/preview (same code as the send).
  const template = await resolveEmailTemplate(eventId, MAIL_HELPER_BULK_STATUS_PURPOSE_KEY);

  return NextResponse.json({
    documentTypes: documentTypes.map((d) => ({ id: d.id, name: d.data?.displayName || d.name })),
    rows,
    template: { subject: template.subject, body: template.body },
  });
}
