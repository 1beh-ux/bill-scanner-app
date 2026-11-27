// Automatic e-mails (2026-11-27, src/lib/automation.ts): one rule's template to one participant -- the same send as
// "Poslat e-mail" (variables, text variants, the template's attachments, CC by the event's rule), as the event's
// sending mailbox. Without a usable mailbox nothing is sent and the claim is released (tried again next time).
import { prisma } from "@/lib/prisma";
import { resolveEmailTemplate } from "@/lib/email-template";
import { eventTemplateKey } from "@/lib/email-kinds";
import { attachmentIdsFor } from "@/lib/email-attachments";
import { eventSender } from "@/lib/auto-accept";
import { sendBulkParticipantEmail } from "@/lib/participant-bulk-email";

export async function sendRuleEmail(eventId: string, purposeKey: string, participantId: string): Promise<boolean> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  const sender = await eventSender(event);
  const release = () => prisma.mailRuleSend.deleteMany({ where: { participantId, rule: { eventId, purposeKey } } });
  if (!sender) {
    await release();
    return false;
  }
  const key = eventTemplateKey(event, purposeKey);
  const template = await resolveEmailTemplate(eventId, key);
  const r = await sendBulkParticipantEmail({
    eventId,
    participantIds: [participantId],
    subject: template.subject,
    body: template.body,
    purposeKey: key,
    sentByUserId: sender.userId,
    markAccepted: false,
    autoAttachDocumentTypeIds: attachmentIdsFor(event, key),
  });
  return r.results.some((x) => x.status === "sent");
}
