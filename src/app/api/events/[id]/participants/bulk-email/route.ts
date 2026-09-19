import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { sendBulkParticipantEmail } from "@/lib/participant-bulk-email";
import { PARTICIPANT_OPEN_EMAIL_PURPOSE_KEY } from "@/lib/email-template-purpose-keys";

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;

  const form = await req.formData();
  const participantIds: string[] = JSON.parse(String(form.get("participantIds") || "[]"));
  const subject = String(form.get("subject") || "").trim();
  const body = String(form.get("body") || "").trim();
  const purposeKey = String(form.get("purposeKey") || PARTICIPANT_OPEN_EMAIL_PURPOSE_KEY);
  const markAccepted = form.get("markAccepted") === "true";
  const autoAttachDocumentTypeIds: string[] | undefined = form.get("autoAttachDocumentTypeIds")
    ? JSON.parse(String(form.get("autoAttachDocumentTypeIds")))
    : undefined;
  const sendEmail = form.get("sendEmail") !== "false";
  const file = form.get("attachment");

  if (participantIds.length === 0 || (sendEmail && (!subject || !body))) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  let attachment: { buffer: Buffer; filename: string; mimeType: string } | undefined;
  if (file instanceof File) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: "attachment_too_large" }, { status: 400 });
    }
    attachment = {
      buffer: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
    };
  }

  const { results, documentsGenerated, documentFailures } = await sendBulkParticipantEmail({
    eventId,
    participantIds,
    subject,
    body,
    purposeKey,
    sentByUserId: user.id,
    markAccepted,
    attachment,
    autoAttachDocumentTypeIds,
    sendEmail,
  });
  const sentCount = results.filter((r) => r.status === "sent").length;
  const failedCount = results.filter((r) => r.status === "failed").length;

  return NextResponse.json({ sentCount, failedCount, documentsGenerated, documentFailures, results });
}
