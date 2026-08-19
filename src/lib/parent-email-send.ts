import { prisma } from "@/lib/prisma";
import { resolveEmailTemplate, substituteVariables, PARENT_SUMMARY_PURPOSE_KEY } from "@/lib/email-template";
import { generateParticipantSummaryPdf } from "@/lib/parent-summary-pdf";
import { sendParentSummaryEmail } from "@/lib/mail";

export interface GuardianSendResult {
  guardianId: string;
  guardianEmail: string;
  status: "sent" | "failed";
  errorMessage?: string;
}

export function formatDateRange(startDate: Date, endDate: Date): string {
  const start = startDate.toLocaleDateString("cs-CZ");
  const end = endDate.toLocaleDateString("cs-CZ");
  return start === end ? start : `${start} – ${end}`;
}

/** Resolved subject + body with the same variable substitution the real send uses, for a pre-send preview. */
export async function resolveEmailPreview(
  participantId: string,
  senderDisplayName: string
): Promise<{ subject: string; body: string }> {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { event: true },
  });
  if (!participant) throw new Error("participant_not_found");

  const { subject: templateSubject, body: templateBody } = await resolveEmailTemplate(
    participant.eventId,
    PARENT_SUMMARY_PURPOSE_KEY
  );
  const vars = {
    child_name: participant.name,
    camp_name: participant.event.name,
    date_range: formatDateRange(participant.event.startDate, participant.event.endDate),
    sender_name: senderDisplayName,
  };
  return {
    subject: substituteVariables(templateSubject, vars),
    body: substituteVariables(templateBody, vars),
  };
}

/**
 * Sends the participant's summary PDF to their guardians (all
 * receivesCommunications=true ones, or a specific subset for a resend) and
 * writes one ParentEmailLog row per guardian regardless of outcome --
 * per-recipient failure isolation, same principle as the bills/participants
 * bulk routes.
 */
export async function sendSummaryToGuardians(
  participantId: string,
  sentByUserId: string,
  guardianIds?: string[]
): Promise<GuardianSendResult[]> {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: {
      event: true,
      guardians: guardianIds
        ? { where: { id: { in: guardianIds } } }
        : { where: { receivesCommunications: true } },
    },
  });
  if (!participant) throw new Error("participant_not_found");
  if (participant.guardians.length === 0) return [];

  const senderEmail = participant.event.senderEmail;
  if (!senderEmail) {
    const results: GuardianSendResult[] = [];
    for (const guardian of participant.guardians) {
      await prisma.parentEmailLog.create({
        data: {
          participantId,
          guardianId: guardian.id,
          purposeKey: PARENT_SUMMARY_PURPOSE_KEY,
          status: "failed",
          errorMessage: "sender_not_configured",
          sentByUserId,
        },
      });
      results.push({ guardianId: guardian.id, guardianEmail: guardian.email, status: "failed", errorMessage: "sender_not_configured" });
    }
    return results;
  }

  const sentByUser = await prisma.user.findUnique({ where: { id: sentByUserId } });
  const senderDisplayName = sentByUser?.displayName ?? "Zdravotník";

  const { subject: templateSubject, body: templateBody } = await resolveEmailTemplate(
    participant.eventId,
    PARENT_SUMMARY_PURPOSE_KEY
  );
  const vars = {
    child_name: participant.name,
    camp_name: participant.event.name,
    date_range: formatDateRange(participant.event.startDate, participant.event.endDate),
    sender_name: senderDisplayName,
  };
  const subject = substituteVariables(templateSubject, vars);
  const body = substituteVariables(templateBody, vars);

  let pdf: { buffer: Buffer; gcsPath: string; filename: string } | null = null;
  let pdfError: string | null = null;
  try {
    pdf = await generateParticipantSummaryPdf(participantId);
  } catch (err) {
    pdfError = err instanceof Error ? err.message : String(err);
  }

  const results: GuardianSendResult[] = [];
  for (const guardian of participant.guardians) {
    if (!pdf) {
      await prisma.parentEmailLog.create({
        data: {
          participantId,
          guardianId: guardian.id,
          purposeKey: PARENT_SUMMARY_PURPOSE_KEY,
          status: "failed",
          errorMessage: pdfError ?? "pdf_generation_failed",
          sentByUserId,
        },
      });
      results.push({ guardianId: guardian.id, guardianEmail: guardian.email, status: "failed", errorMessage: pdfError ?? "pdf_generation_failed" });
      continue;
    }

    try {
      await sendParentSummaryEmail({
        to: guardian.email,
        fromName: senderDisplayName,
        senderEmail,
        subject,
        body,
        pdfBuffer: pdf.buffer,
        pdfFilename: pdf.filename,
      });
      await prisma.parentEmailLog.create({
        data: {
          participantId,
          guardianId: guardian.id,
          purposeKey: PARENT_SUMMARY_PURPOSE_KEY,
          status: "sent",
          sentByUserId,
          pdfGcsPath: pdf.gcsPath,
        },
      });
      results.push({ guardianId: guardian.id, guardianEmail: guardian.email, status: "sent" });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await prisma.parentEmailLog.create({
        data: {
          participantId,
          guardianId: guardian.id,
          purposeKey: PARENT_SUMMARY_PURPOSE_KEY,
          status: "failed",
          errorMessage,
          sentByUserId,
          pdfGcsPath: pdf.gcsPath,
        },
      });
      results.push({ guardianId: guardian.id, guardianEmail: guardian.email, status: "failed", errorMessage });
    }
  }

  return results;
}
