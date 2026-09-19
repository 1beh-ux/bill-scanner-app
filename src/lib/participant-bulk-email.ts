import { prisma } from "@/lib/prisma";
import { substituteVariables } from "@/lib/email-template";
import { sendEmailWithOptionalAttachment } from "@/lib/mail";
import { resolveVariables, ensureRegistrationNumber } from "@/lib/document-variables";
import { mergeAndExportDocument } from "@/lib/document-merge";
import { saveGeneratedParticipantDocument } from "@/lib/participant-document-store";
import { participantsRootFolderId, syncParticipantDocumentToDrive } from "@/lib/mail-drive-sync";
import type { DocumentTypeData } from "@/lib/mail-reply-template";

export interface BulkEmailResult {
  participantId: string;
  guardianId: string;
  guardianEmail: string;
  status: "sent" | "failed";
  errorMessage?: string;
  // Auto-attach documents that could not be generated for this participant
  // (the email still went out without them).
  documentFailures?: string[];
}

/**
 * Generates the acceptance-send's auto-attach documents for one
 * participant: assigns a stable registration number (payment variable
 * symbol) the first time this runs for them, resolves merge variables, and
 * merges every event document type flagged autoAttachOnAccept (further
 * filtered by whichever ones the admin left checked in the send dialog --
 * `allowedDocumentTypeIds`, undefined meaning "all"). A single template
 * failing to merge is logged and skipped rather than blocking the send.
 */
async function buildAutoAttachDocuments(
  participant: Awaited<ReturnType<typeof loadParticipant>>,
  event: {
    id: string;
    name: string;
    startDate: Date;
    memberPriceCzk: number | null;
    nonMemberPriceCzk: number | null;
    registrationBankAccountNumber: string | null;
    registrationBankCode: string | null;
    vsEventType: number | null;
    vsOrderInYear: number | null;
    vsMembershipFieldKey: string | null;
    mailQuestionnaireUrl: string | null;
    driveParticipantsFolderId: string | null;
    driveExportFolderId: string | null;
  },
  allowedDocumentTypeIds: string[] | undefined,
  generatedByUserId: string
): Promise<{ attachments: { buffer: Buffer; filename: string; mimeType: string }[]; failedDocuments: string[] }> {
  const failedDocuments: string[] = [];
  if (!participant) return { attachments: [], failedDocuments };

  await ensureRegistrationNumber(participant.id, event.id);
  const refreshed = await prisma.participant.findUnique({ where: { id: participant.id } });
  if (!refreshed) return { attachments: [], failedDocuments };

  const documentTypes = await prisma.eventListItem.findMany({
    where: { eventId: event.id, kind: "document", active: true },
  });

  const attachments: { buffer: Buffer; filename: string; mimeType: string }[] = [];
  const { text, images } = await resolveVariables(
    {
      ...refreshed,
      customFieldValues: refreshed.customFieldValues as Record<string, string> | null,
      guardians: participant.guardians,
    },
    event
  );

  for (const docType of documentTypes) {
    const data = docType.data as DocumentTypeData | null;
    if (!data?.templateGoogleDocId) continue;
    if (!data.autoAttachOnAccept) continue;
    if (allowedDocumentTypeIds && !allowedDocumentTypeIds.includes(docType.id)) continue;

    try {
      const buffer = await mergeAndExportDocument(data.templateGoogleDocId, text, images);
      const filename = `${docType.name}.pdf`;
      attachments.push({ buffer, filename, mimeType: "application/pdf" });
      // Persisted the same way a received document is (see
      // participant-document-store.ts's own comment) -- a save failure
      // here shouldn't block the email, which already has the attachment
      // in hand, so it's logged and skipped rather than thrown.
      try {
        const documentId = await saveGeneratedParticipantDocument({
          eventId: event.id,
          participantId: participant.id,
          eventListItemId: docType.id,
          buffer,
          filename,
          generatedByUserId,
        });
        // Straight into the participant's Drive folder when one is
        // configured; if Drive fails the row stays pending for the sync button.
        const rootFolderId = participantsRootFolderId(event);
        if (rootFolderId) {
          await syncParticipantDocumentToDrive(documentId, rootFolderId).catch((err) =>
            console.log(`[participant-bulk-email] Drive upload of "${docType.name}" for participant ${participant.id} failed (sync button will retry):`, String(err))
          );
        }
      } catch (err) {
        console.log(`[participant-bulk-email] failed to save generated document "${docType.name}" for participant ${participant.id}:`, String(err));
      }
    } catch (err) {
      failedDocuments.push(docType.name);
      console.log(`[participant-bulk-email] failed to merge document "${docType.name}" for participant ${participant.id}:`, String(err));
    }
  }

  return { attachments, failedDocuments };
}

function loadParticipant(participantId: string) {
  return prisma.participant.findUnique({
    where: { id: participantId },
    include: { guardians: { where: { receivesCommunications: true } } },
  });
}

/**
 * Sends the same subject/body (with {{participant_name}}/{{camp_name}}/
 * {{sender_name}} substituted per participant) to every receiving guardian
 * of the given participants, with an optional shared manual attachment plus
 * (on acceptance sends) auto-generated registration documents. Backs both
 * the registration-acceptance send and the freeform "open email" feature --
 * same mechanics, only the subject/body/purposeKey/markAccepted differ.
 *
 * Structured like sendBulkStatusUpdates (src/lib/mail-bulk-status-send.ts):
 * per-guardian try/catch, one ParentEmailLog row per attempt regardless of
 * outcome, so one bad address never blocks the rest of the batch.
 */
export async function sendBulkParticipantEmail(opts: {
  eventId: string;
  participantIds: string[];
  subject: string;
  body: string;
  purposeKey: string;
  sentByUserId: string;
  markAccepted: boolean;
  attachment?: { buffer: Buffer; filename: string; mimeType: string };
  autoAttachDocumentTypeIds?: string[];
}): Promise<BulkEmailResult[]> {
  const event = await prisma.event.findUnique({ where: { id: opts.eventId } });
  if (!event) throw new Error("event_not_found");

  const senderEmail = event.senderEmail;
  const sentByUser = await prisma.user.findUnique({ where: { id: opts.sentByUserId } });
  const senderDisplayName = sentByUser?.emailSignature || sentByUser?.displayName || "Tábor";

  const results: BulkEmailResult[] = [];

  for (const participantId of opts.participantIds) {
    const participant = await loadParticipant(participantId);
    if (!participant) continue;

    const { text: fieldVars } = await resolveVariables(
      { ...participant, customFieldValues: participant.customFieldValues as Record<string, string> | null },
      event
    );
    const vars = { ...fieldVars, participant_name: participant.name, camp_name: event.name, sender_name: senderDisplayName };
    const subject = substituteVariables(opts.subject, vars);
    const body = substituteVariables(opts.body, vars);

    const generated = opts.markAccepted
      ? await buildAutoAttachDocuments(participant, event, opts.autoAttachDocumentTypeIds, opts.sentByUserId)
      : { attachments: [], failedDocuments: [] as string[] };
    const attachments = [...(opts.attachment ? [opts.attachment] : []), ...generated.attachments];
    const documentFailures = generated.failedDocuments.length > 0 ? generated.failedDocuments : undefined;

    for (const guardian of participant.guardians) {
      if (!senderEmail) {
        await prisma.parentEmailLog.create({
          data: {
            participantId,
            guardianId: guardian.id,
            purposeKey: opts.purposeKey,
            status: "failed",
            errorMessage: "sender_not_configured",
            sentByUserId: opts.sentByUserId,
          },
        });
        results.push({
          participantId,
          guardianId: guardian.id,
          guardianEmail: guardian.email,
          status: "failed",
          errorMessage: "sender_not_configured",
        });
        continue;
      }

      try {
        await sendEmailWithOptionalAttachment({
          to: guardian.email,
          fromName: senderDisplayName,
          senderEmail,
          subject,
          body,
          attachments,
        });
        await prisma.parentEmailLog.create({
          data: { participantId, guardianId: guardian.id, purposeKey: opts.purposeKey, status: "sent", sentByUserId: opts.sentByUserId },
        });
        results.push({ participantId, guardianId: guardian.id, guardianEmail: guardian.email, status: "sent", documentFailures });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await prisma.parentEmailLog.create({
          data: {
            participantId,
            guardianId: guardian.id,
            purposeKey: opts.purposeKey,
            status: "failed",
            errorMessage,
            sentByUserId: opts.sentByUserId,
          },
        });
        results.push({ participantId, guardianId: guardian.id, guardianEmail: guardian.email, status: "failed", errorMessage });
      }
    }
  }

  // Acceptance is a decision, independent of whether the email actually
  // sent (a bounced/missing address shouldn't block marking someone
  // accepted -- the admin already decided; they can retry the email
  // separately). Runs for every requested participant, guardians or not.
  if (opts.markAccepted) {
    await prisma.participant.updateMany({
      where: { id: { in: opts.participantIds } },
      data: { registrationStatus: "accepted" },
    });
  }

  return results;
}
