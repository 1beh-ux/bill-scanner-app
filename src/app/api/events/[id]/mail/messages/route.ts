import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { requireEventSenderEmail } from "@/lib/mail-helper-context";
import { listInboxMessagesWithDetails } from "@/lib/mail-read";

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

  const count = Number(req.nextUrl.searchParams.get("count") || 25);

  let senderEmail: string;
  try {
    senderEmail = await requireEventSenderEmail(eventId);
  } catch {
    return NextResponse.json({ error: "sender_not_configured" }, { status: 409 });
  }

  try {
    const messages = await listInboxMessagesWithDetails(senderEmail, count);
    return NextResponse.json(messages);
  } catch (err) {
    console.error("[mail/messages] list failed:", err);
    return NextResponse.json({ error: "gmail_list_failed" }, { status: 502 });
  }
}
