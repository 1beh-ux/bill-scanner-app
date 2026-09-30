import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { buildReplyText } from "@/lib/mail-reply-build";

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

  const extraReceivedIds = [
    ...attachmentActions.filter((a) => a.participantId === participantId && a.eventListItemId).map((a) => a.eventListItemId!),
    ...flagOnlyEventListItemIds,
  ];
  const replyText = await buildReplyText({ eventId, participantId, userId: user.id, extraReceivedIds, note });
  if (replyText === null) return NextResponse.json({ error: "participant_not_found" }, { status: 404 });

  return NextResponse.json({ replyText });
}
