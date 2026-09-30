// The Pošta reply text: the event's "Odpověď na e-mail" template (org default =
// the old fixed wording) filled in for one participant. Used by the reply
// preview in the inbox and the template editor's real-data preview.
import { prisma } from "@/lib/prisma";
import { resolveEmailTemplate, senderIdentity, substituteVariables, MAIL_HELPER_REPLY_PURPOSE_KEY } from "@/lib/email-template";
import { resolveContactEmail, resolveVariables } from "@/lib/document-variables";
import { getActiveDocumentTypes, getReceivedItemIds } from "@/lib/mail-helper-context";
import { buildDocumentChecklistLines } from "@/lib/mail-reply-template";

export async function buildReplyText(opts: {
  eventId: string;
  participantId: string;
  userId: string;
  // Documents to show as received: existing + what the pending actions would add.
  extraReceivedIds?: string[];
  note?: string;
  template?: { body: string };
}): Promise<string | null> {
  const [event, participant, user, documentTypes] = await Promise.all([
    prisma.event.findUnique({ where: { id: opts.eventId } }),
    prisma.participant.findUnique({ where: { id: opts.participantId }, include: { guardians: true } }),
    prisma.user.findUnique({ where: { id: opts.userId } }),
    getActiveDocumentTypes(opts.eventId),
  ]);
  if (!event || !participant || participant.eventId !== opts.eventId) return null;

  const existing = await getReceivedItemIds(participant.id);
  const received = new Set([...existing, ...(opts.extraReceivedIds ?? [])]);
  const application = documentTypes.find((d) => d.key === "APPLICATION");
  const isFirstTimeApplication = Boolean(application && received.has(application.id) && !existing.has(application.id));
  const questionnaire = documentTypes.find((d) => d.key === "QUESTIONNAIRE");
  const questionnaireNeeded = Boolean(questionnaire && !received.has(questionnaire.id));
  const url = (event.mailQuestionnaireUrl ?? "").trim();

  const { text: fieldVars } = await resolveVariables(
    { ...participant, customFieldValues: participant.customFieldValues as Record<string, string> | null },
    event,
    "email"
  );
  const sender = senderIdentity(user, "Pošta tábora");
  const vars = {
    ...fieldVars,
    participant_name: participant.name,
    camp_name: event.name,
    document_checklist: buildDocumentChecklistLines(documentTypes, received, { isFirstTimeApplication }).join("\n"),
    questionnaire_line: questionnaireNeeded && url ? `Odkaz na vyplnění dotazníku: ${url}.` : "",
    questionnaire_url: url,
    note: (opts.note ?? "").trim(),
    sender_name: sender.name,
    signature: sender.signature,
    contact_email: resolveContactEmail(participant),
  };
  const body = opts.template?.body ?? (await resolveEmailTemplate(opts.eventId, MAIL_HELPER_REPLY_PURPOSE_KEY)).body;
  // Empty optional lines (no questionnaire link, no note) leave no gaps.
  return substituteVariables(body, vars).replace(/\n{3,}/g, "\n\n").trim();
}
