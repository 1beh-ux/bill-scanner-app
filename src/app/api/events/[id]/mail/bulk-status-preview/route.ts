import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { getActiveDocumentTypes, getReceivedItemIds } from "@/lib/mail-helper-context";
import { resolveEmailTemplate, substituteVariables, MAIL_HELPER_BULK_STATUS_PURPOSE_KEY } from "@/lib/email-template";
import { substituteDummyTemplateValues } from "@/lib/email-template-preview";
import { buildDocumentChecklistText } from "@/lib/mail-bulk-status-template";

// Mirrors the old app's api_prepareBulk -- one row per participant with a
// communicating guardian, per-document-type received/missing, defaultSend
// = not fully complete (so finished families aren't re-contacted), plus a
// dummy-value template preview.
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
    where: { eventId, active: true, guardians: { some: { receivesCommunications: true } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const rows = await Promise.all(
    participants.map(async (p) => {
      const receivedItemIds = await getReceivedItemIds(p.id);
      const allComplete = documentTypes.every((d) => receivedItemIds.has(d.id));
      return {
        participantId: p.id,
        participantName: p.name,
        allComplete,
        defaultSend: !allComplete,
        documents: documentTypes.map((d) => ({ eventListItemId: d.id, received: receivedItemIds.has(d.id) })),
      };
    })
  );

  const { subject, body } = await resolveEmailTemplate(eventId, MAIL_HELPER_BULK_STATUS_PURPOSE_KEY);
  const previewVars = {
    participant_name: "Jméno dítěte",
    document_checklist: buildDocumentChecklistText(documentTypes, new Set()),
  };
  const templatePreview = {
    subject: substituteDummyTemplateValues(substituteVariables(subject, previewVars), MAIL_HELPER_BULK_STATUS_PURPOSE_KEY),
    body: substituteDummyTemplateValues(substituteVariables(body, previewVars), MAIL_HELPER_BULK_STATUS_PURPOSE_KEY),
  };

  return NextResponse.json({
    documentTypes: documentTypes.map((d) => ({ id: d.id, name: d.data?.displayName || d.name })),
    rows,
    templatePreview,
  });
}
