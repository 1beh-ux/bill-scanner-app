import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { requireEventSenderEmail } from "@/lib/mail-helper-context";
import {
  getMessageAttachmentContent,
  getReplyToAddress,
  replyToMessage,
  moveMessageToDoneLabel,
} from "@/lib/mail-read";
import { billsBucket, sanitizeFilename } from "@/lib/gcs";
import { MAIL_HELPER_REPLY_PURPOSE_KEY } from "@/lib/email-template";

const DEFAULT_DONE_LABEL = "MailHelperDone";

type AttachmentAction = { attachmentId: string; filename: string; mimeType: string; eventListItemId: string | null; participantId: string };
type ExecuteActions = { saveAttachments: boolean; sendReply: boolean; moveEmail: boolean; updateStatus: boolean };

async function findOrCreateGuardian(participantId: string, email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const existing = await prisma.participantGuardian.findFirst({
    where: { participantId, email: { equals: normalized, mode: "insensitive" } },
  });
  if (existing) return existing.id;

  const created = await prisma.participantGuardian.create({
    data: { participantId, email: normalized, receivesCommunications: true },
  });
  return created.id;
}

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
  const participantId: string | undefined = body.participantId;
  const subject: string = typeof body.subject === "string" ? body.subject : "";
  const replyText: string = typeof body.replyText === "string" ? body.replyText : "";
  const attachmentActions: AttachmentAction[] = Array.isArray(body.attachmentActions) ? body.attachmentActions : [];
  const flagOnlyEventListItemIds: string[] = Array.isArray(body.flagOnlyEventListItemIds)
    ? body.flagOnlyEventListItemIds
    : [];
  const actions: ExecuteActions = {
    saveAttachments: Boolean(body.actions?.saveAttachments),
    sendReply: Boolean(body.actions?.sendReply),
    moveEmail: Boolean(body.actions?.moveEmail),
    updateStatus: Boolean(body.actions?.updateStatus),
  };

  if (!participantId) {
    return NextResponse.json({ error: "participant_id_required" }, { status: 400 });
  }

  let senderEmail: string;
  try {
    senderEmail = await requireEventSenderEmail(eventId);
  } catch {
    return NextResponse.json({ error: "sender_not_configured" }, { status: 409 });
  }

  const savedFiles: { name: string; eventListItemId: string; participantId: string }[] = [];

  if (actions.saveAttachments) {
    for (const action of attachmentActions) {
      if (!action.eventListItemId) continue;
      try {
        const buffer = await getMessageAttachmentContent(senderEmail, messageId, action.attachmentId);
        const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16);
        const filename = `${hash}-${sanitizeFilename(action.filename || "attachment")}`;
        const gcsObjectPath = `events/${eventId}/mail/documents/${action.participantId}/${filename}`;

        await billsBucket.file(gcsObjectPath).save(buffer, { contentType: action.mimeType || "application/octet-stream" });

        await prisma.participantDocument.create({
          data: {
            participantId: action.participantId,
            eventListItemId: action.eventListItemId,
            gcsPath: gcsObjectPath,
            contentHash: hash,
            originalFilename: action.filename || null,
            receivedVia: "email",
            sourceEmailMessageId: messageId,
            receivedByUserId: user.id,
          },
        });

        await prisma.mailActionLog.create({
          data: {
            userId: user.id,
            eventId,
            action: "attachment_saved",
            messageId,
            participantId: action.participantId,
            subject,
            status: "ok",
          },
        });

        savedFiles.push({ name: filename, eventListItemId: action.eventListItemId, participantId: action.participantId });
      } catch (err) {
        await prisma.mailActionLog.create({
          data: {
            userId: user.id,
            eventId,
            action: "attachment_saved",
            messageId,
            participantId: action.participantId,
            subject,
            status: "error",
            details: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }
  }

  if (actions.updateStatus) {
    for (const eventListItemId of flagOnlyEventListItemIds) {
      await prisma.participantDocument.create({
        data: {
          participantId,
          eventListItemId,
          receivedVia: "manual",
          sourceEmailMessageId: messageId,
          receivedByUserId: user.id,
        },
      });
      await prisma.mailActionLog.create({
        data: {
          userId: user.id,
          eventId,
          action: "attachment_saved",
          messageId,
          participantId,
          subject,
          status: "ok",
          details: "flag only, no attached file",
        },
      });
    }
  }

  if (actions.sendReply) {
    if (!replyText.trim()) {
      return NextResponse.json({ error: "reply_text_required" }, { status: 400 });
    }
    try {
      const to = await getReplyToAddress(senderEmail, messageId);
      await replyToMessage(senderEmail, { messageId, to, subject, body: replyText, fromName: user.displayName });
      const guardianId = await findOrCreateGuardian(participantId, to);
      await prisma.parentEmailLog.create({
        data: {
          participantId,
          guardianId,
          purposeKey: MAIL_HELPER_REPLY_PURPOSE_KEY,
          status: "sent",
          sentByUserId: user.id,
        },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const to = await getReplyToAddress(senderEmail, messageId).catch(() => "");
      if (to) {
        const guardianId = await findOrCreateGuardian(participantId, to);
        await prisma.parentEmailLog.create({
          data: {
            participantId,
            guardianId,
            purposeKey: MAIL_HELPER_REPLY_PURPOSE_KEY,
            status: "failed",
            errorMessage,
            sentByUserId: user.id,
          },
        });
      }
      return NextResponse.json({ error: "reply_send_failed", details: errorMessage }, { status: 502 });
    }
  }

  if (actions.moveEmail) {
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { mailDoneLabelName: true } });
    try {
      await moveMessageToDoneLabel(senderEmail, messageId, event?.mailDoneLabelName || DEFAULT_DONE_LABEL);
      await prisma.mailActionLog.create({
        data: { userId: user.id, eventId, action: "bulk_move", messageId, participantId, subject, status: "ok" },
      });
    } catch (err) {
      await prisma.mailActionLog.create({
        data: {
          userId: user.id,
          eventId,
          action: "bulk_move",
          messageId,
          participantId,
          subject,
          status: "error",
          details: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  return NextResponse.json({ ok: true, savedFiles });
}
