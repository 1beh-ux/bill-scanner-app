import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { getActiveDocumentTypes, getReceivedItemIds } from "@/lib/mail-helper-context";
import { buildSingleReplyText } from "@/lib/mail-reply-template";

type AttachmentAction = { attachmentId: string; eventListItemId: string | null; participantId: string };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "mail");
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const participantId: string | undefined = body.participantId;
  const note: string = typeof body.note === "string" ? body.note : "";
  const attachmentActions: AttachmentAction[] = Array.isArray(body.attachmentActions) ? body.attachmentActions : [];
  const flagOnlyEventListItemIds: string[] = Array.isArray(body.flagOnlyEventListItemIds)
    ? body.flagOnlyEventListItemIds
    : [];

  if (!participantId) {
    return NextResponse.json({ error: "participant_id_required" }, { status: 400 });
  }

  const participant = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!participant || participant.eventId !== eventId) {
    return NextResponse.json({ error: "participant_not_found" }, { status: 404 });
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { mailQuestionnaireUrl: true },
  });

  const documentTypes = await getActiveDocumentTypes(eventId);
  const existingReceived = await getReceivedItemIds(participantId);
  const receivedItemIds = new Set(existingReceived);

  for (const action of attachmentActions) {
    if (action.participantId === participantId && action.eventListItemId) {
      receivedItemIds.add(action.eventListItemId);
    }
  }
  for (const id of flagOnlyEventListItemIds) {
    receivedItemIds.add(id);
  }

  const applicationDocType = documentTypes.find((d) => d.key === "APPLICATION");
  const isFirstTimeApplication = Boolean(
    applicationDocType &&
      receivedItemIds.has(applicationDocType.id) &&
      !existingReceived.has(applicationDocType.id)
  );

  const questionnaireDocType = documentTypes.find((d) => d.key === "QUESTIONNAIRE");
  const questionnaireNeeded = Boolean(questionnaireDocType && !receivedItemIds.has(questionnaireDocType.id));

  const signature = user.displayName || "Pošta tábora";

  const replyText = buildSingleReplyText({
    documentTypes,
    receivedItemIds,
    isFirstTimeApplication,
    questionnaireNeeded,
    questionnaireUrl: event?.mailQuestionnaireUrl,
    note,
    signature,
  });

  return NextResponse.json({ replyText });
}
