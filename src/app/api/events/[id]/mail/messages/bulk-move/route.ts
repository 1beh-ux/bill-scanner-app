import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { requireEventSenderEmail } from "@/lib/mail-helper-context";
import { moveMessageToDoneLabel } from "@/lib/mail-read";

const DEFAULT_DONE_LABEL = "MailHelperDone";

// Mirrors the old app's api_bulkMoveEmails -- per-message try/catch so one
// failure doesn't block the rest, one MailActionLog row per message.
export async function POST(
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

  const body = await req.json().catch(() => ({}));
  const messageIds: string[] = Array.isArray(body.messageIds) ? body.messageIds : [];
  if (messageIds.length === 0) {
    return NextResponse.json({ error: "message_ids_required" }, { status: 400 });
  }

  let senderEmail: string;
  try {
    senderEmail = await requireEventSenderEmail(eventId);
  } catch {
    return NextResponse.json({ error: "sender_not_configured" }, { status: 409 });
  }

  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { mailDoneLabelName: true } });
  const labelName = event?.mailDoneLabelName || DEFAULT_DONE_LABEL;

  const moved: string[] = [];
  const failed: { messageId: string; error: string }[] = [];

  for (const messageId of messageIds) {
    try {
      await moveMessageToDoneLabel(senderEmail, messageId, labelName);
      moved.push(messageId);
      await prisma.mailActionLog.create({
        data: { userId: user.id, eventId, action: "bulk_move", messageId, status: "ok" },
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      failed.push({ messageId, error });
      await prisma.mailActionLog.create({
        data: { userId: user.id, eventId, action: "bulk_move", messageId, status: "error", details: error },
      });
    }
  }

  return NextResponse.json({ movedCount: moved.length, failedCount: failed.length, moved, failed });
}
