import { prisma } from "@/lib/prisma";
import { resolveEmailTemplate, substituteVariables, MAIL_HELPER_BULK_STATUS_PURPOSE_KEY } from "@/lib/email-template";
import { sendPlainTextEmail } from "@/lib/mail";
import { getActiveDocumentTypes, getReceivedItemIds } from "@/lib/mail-helper-context";
import { buildDocumentChecklistText } from "@/lib/mail-bulk-status-template";

export interface BulkStatusSendResult {
  participantId: string;
  guardianId: string;
  guardianEmail: string;
  status: "sent" | "failed";
  errorMessage?: string;
}

// Structured exactly like sendSummaryToGuardians (src/lib/parent-email-send.ts):
// per-guardian try/catch, one ParentEmailLog row per attempt regardless of
// outcome, so a bad address for one family never blocks the rest of the batch.
export async function sendBulkStatusUpdates(
  eventId: string,
  participantIds: string[],
  sentByUserId: string
): Promise<BulkStatusSendResult[]> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new Error("event_not_found");

  const senderEmail = event.senderEmail;
  const documentTypes = await getActiveDocumentTypes(eventId);
  const sentByUser = await prisma.user.findUnique({ where: { id: sentByUserId } });
  const senderDisplayName = sentByUser?.displayName ?? "Pošta tábora";

  const { subject: templateSubject, body: templateBody } = await resolveEmailTemplate(
    eventId,
    MAIL_HELPER_BULK_STATUS_PURPOSE_KEY
  );

  const results: BulkStatusSendResult[] = [];

  for (const participantId of participantIds) {
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      include: { guardians: { where: { receivesCommunications: true } } },
    });
    if (!participant || participant.guardians.length === 0) continue;

    const receivedItemIds = await getReceivedItemIds(participantId);
    const vars = {
      participant_name: participant.name,
      camp_name: event.name,
      document_checklist: buildDocumentChecklistText(documentTypes, receivedItemIds),
      questionnaire_url: event.mailQuestionnaireUrl ?? "",
      sender_name: senderDisplayName,
    };
    const subject = substituteVariables(templateSubject, vars);
    const body = substituteVariables(templateBody, vars);

    for (const guardian of participant.guardians) {
      if (!senderEmail) {
        await prisma.parentEmailLog.create({
          data: {
            participantId,
            guardianId: guardian.id,
            purposeKey: MAIL_HELPER_BULK_STATUS_PURPOSE_KEY,
            status: "failed",
            errorMessage: "sender_not_configured",
            sentByUserId,
          },
        });
        results.push({ participantId, guardianId: guardian.id, guardianEmail: guardian.email, status: "failed", errorMessage: "sender_not_configured" });
        continue;
      }

      try {
        await sendPlainTextEmail({ to: guardian.email, fromName: senderDisplayName, senderEmail, subject, body });
        await prisma.parentEmailLog.create({
          data: {
            participantId,
            guardianId: guardian.id,
            purposeKey: MAIL_HELPER_BULK_STATUS_PURPOSE_KEY,
            status: "sent",
            sentByUserId,
          },
        });
        results.push({ participantId, guardianId: guardian.id, guardianEmail: guardian.email, status: "sent" });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await prisma.parentEmailLog.create({
          data: {
            participantId,
            guardianId: guardian.id,
            purposeKey: MAIL_HELPER_BULK_STATUS_PURPOSE_KEY,
            status: "failed",
            errorMessage,
            sentByUserId,
          },
        });
        results.push({ participantId, guardianId: guardian.id, guardianEmail: guardian.email, status: "failed", errorMessage });
      }
    }
  }

  return results;
}
