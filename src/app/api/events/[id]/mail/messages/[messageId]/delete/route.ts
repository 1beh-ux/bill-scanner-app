import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { requireEventSenderEmail } from "@/lib/mail-helper-context";
import { moveMessageToTrash } from "@/lib/mail-read";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId, messageId } = await params;
  const denied = await requireModuleAccess(user, eventId, "mail");
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const subject: string = typeof body.subject === "string" ? body.subject : "";

  let senderEmail: string;
  try {
    senderEmail = await requireEventSenderEmail(eventId);
  } catch {
    return NextResponse.json({ error: "sender_not_configured" }, { status: 409 });
  }

  try {
    await moveMessageToTrash(senderEmail, messageId);
    await prisma.mailActionLog.create({
      data: { userId: user.id, eventId, action: "bulk_delete", messageId, subject, status: "ok" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await prisma.mailActionLog.create({
      data: {
        userId: user.id,
        eventId,
        action: "bulk_delete",
        messageId,
        subject,
        status: "error",
        details: err instanceof Error ? err.message : String(err),
      },
    });
    return NextResponse.json({ error: "delete_failed" }, { status: 502 });
  }
}
