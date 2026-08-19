import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { requireEventSenderEmail } from "@/lib/mail-helper-context";
import { moveMessageToTrash } from "@/lib/mail-read";

// Mirrors the old app's api_bulkDeleteEmails -- per-message try/catch, one
// MailActionLog row per message.
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

  const deleted: string[] = [];
  const failed: { messageId: string; error: string }[] = [];

  for (const messageId of messageIds) {
    try {
      await moveMessageToTrash(senderEmail, messageId);
      deleted.push(messageId);
      await prisma.mailActionLog.create({
        data: { userId: user.id, eventId, action: "bulk_delete", messageId, status: "ok" },
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      failed.push({ messageId, error });
      await prisma.mailActionLog.create({
        data: { userId: user.id, eventId, action: "bulk_delete", messageId, status: "error", details: error },
      });
    }
  }

  return NextResponse.json({ deletedCount: deleted.length, failedCount: failed.length, deleted, failed });
}
