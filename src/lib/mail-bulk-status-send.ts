import { prisma } from "@/lib/prisma";
import { resolveEmailTemplate, senderIdentity, substituteVariables, MAIL_HELPER_BULK_STATUS_PURPOSE_KEY } from "@/lib/email-template";
import { sendPlainTextEmail } from "@/lib/mail";
import { getActiveDocumentTypes, getReceivedItemIds } from "@/lib/mail-helper-context";
import { buildDocumentChecklistText } from "@/lib/mail-bulk-status-template";
import { resolveVariables, resolveContactEmail } from "@/lib/document-variables";

export interface BulkStatusSendResult {
  participantId: string;
  guardianId: string;
  guardianEmail: string;
  status: "sent" | "failed";
  errorMessage?: string;
}

type EventRow = NonNullable<Awaited<ReturnType<typeof prisma.event.findUnique>>>;
type ParticipantRow = NonNullable<Awaited<ReturnType<typeof prisma.participant.findUnique>>> & {
  guardians: { email: string; receivesCommunications: boolean; name: string | null; relationship: string | null; phone: string | null }[];
};

/** {{variables}} of the bulk status e-mail -- shared by the send and the settings preview. */
async function bulkStatusVars(
  participant: ParticipantRow,
  event: EventRow,
  sender: { name: string; signature: string },
  documentTypes: Awaited<ReturnType<typeof getActiveDocumentTypes>>
): Promise<Record<string, string>> {
  const receivedItemIds = await getReceivedItemIds(participant.id);
  const { text: fieldVars } = await resolveVariables(
    { ...participant, customFieldValues: participant.customFieldValues as Record<string, string> | null },
    event
  );
  return {
    ...fieldVars,
    participant_name: participant.name,
    camp_name: event.name,
    document_checklist: buildDocumentChecklistText(documentTypes, receivedItemIds),
    questionnaire_url: event.mailQuestionnaireUrl ?? "",
    sender_name: sender.name,
    signature: sender.signature,
    contact_email: resolveContactEmail(participant),
  };
}

/** The bulk status e-mail for one real participant, from a template being edited. */
export async function previewBulkStatusEmail(
  eventId: string,
  participantId: string,
  sentByUserId: string,
  template: { subject: string; body: string }
): Promise<{ subject: string; body: string } | null> {
  const [event, participant, user] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId } }),
    prisma.participant.findUnique({ where: { id: participantId }, include: { guardians: { where: { receivesCommunications: true } } } }),
    prisma.user.findUnique({ where: { id: sentByUserId } }),
  ]);
  if (!event || !participant || participant.eventId !== eventId) return null;
  const vars = await bulkStatusVars(participant, event, senderIdentity(user, "Pošta tábora"), await getActiveDocumentTypes(eventId));
  return { subject: substituteVariables(template.subject, vars), body: substituteVariables(template.body, vars) };
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
  const sender = senderIdentity(sentByUser, "Pošta tábora");

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

    const vars = await bulkStatusVars(participant, event, sender, documentTypes);
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
            subject,
          },
        });
        results.push({ participantId, guardianId: guardian.id, guardianEmail: guardian.email, status: "failed", errorMessage: "sender_not_configured" });
        continue;
      }

      try {
        await sendPlainTextEmail({ to: guardian.email, fromName: sender.name, senderEmail, subject, body });
        await prisma.parentEmailLog.create({
          data: {
            participantId,
            guardianId: guardian.id,
            purposeKey: MAIL_HELPER_BULK_STATUS_PURPOSE_KEY,
            status: "sent",
            sentByUserId,
            subject,
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
            subject,
          },
        });
        results.push({ participantId, guardianId: guardian.id, guardianEmail: guardian.email, status: "failed", errorMessage });
      }
    }
  }

  return results;
}
