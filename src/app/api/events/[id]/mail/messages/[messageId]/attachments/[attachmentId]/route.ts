import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { requireEventSenderEmail } from "@/lib/mail-helper-context";
import { getMessageAttachmentContent } from "@/lib/mail-read";

// Proxies a Gmail attachment directly to the browser -- no temp files, no
// Drive round-trip and no cleanup job, per the design doc's infra note
// (the old app's approach this replaces used a temp Drive file + 24h
// cleanup, needed only because Apps Script can't stream a blob directly).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string; attachmentId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId, messageId, attachmentId } = await params;
  const denied = await requireModuleAccess(user, eventId, "mail");
  if (denied) return denied;

  const mimeType = req.nextUrl.searchParams.get("mimeType") || "application/octet-stream";
  const filename = req.nextUrl.searchParams.get("filename") || "attachment";

  let senderEmail: string;
  try {
    senderEmail = await requireEventSenderEmail(eventId);
  } catch {
    return NextResponse.json({ error: "sender_not_configured" }, { status: 409 });
  }

  try {
    const buffer = await getMessageAttachmentContent(senderEmail, messageId, attachmentId);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    console.error("[mail/attachments] proxy failed:", err);
    return NextResponse.json({ error: "attachment_fetch_failed" }, { status: 502 });
  }
}
