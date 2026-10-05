// Auto-accept per event (docs/registration-slice3-spec.md E). Only for
// registrations made in the parent portal or on the public page -- never for
// imports or manual adds (those callers simply don't call this).
//
// accept_send reuses the "Přijmout a odeslat" path as is: the event's
// acceptance template unedited, documents generated, one ParentEmailLog row
// per guardian, sent as the event's sending account (Event.senderEmail, a
// connected MailSenderAccount; the log's sender = whoever connected it).
// Without a usable sending account it falls back to plain accept, and the
// event settings show the admin a warning (autoSendReady = false).
import { prisma } from "@/lib/prisma";
import { resolveEmailTemplate } from "@/lib/email-template";
import { REGISTRATION_ACCEPTANCE_PURPOSE_KEY } from "@/lib/email-template-purpose-keys";
import { sendBulkParticipantEmail } from "@/lib/participant-bulk-email";

export type AutoAcceptMode = "manual" | "accept" | "accept_send";
export type RegistrationSource = "portal" | "public" | "import" | "manual";

/** What to do with a new registration: nothing, accept, or accept + send (fallback = accept_send without a sender). */
export function autoAcceptPlan(mode: AutoAcceptMode, source: RegistrationSource, hasSender: boolean): { accept: boolean; send: boolean; fallback: boolean } {
  if (mode === "manual" || (source !== "portal" && source !== "public")) return { accept: false, send: false, fallback: false };
  if (mode === "accept") return { accept: true, send: false, fallback: false };
  return { accept: true, send: hasSender, fallback: !hasSender };
}

/** The event's sending account: its senderEmail, if that mailbox is connected. */
export async function eventSender(event: { senderEmail: string | null }): Promise<{ email: string; userId: string } | null> {
  if (!event.senderEmail) return null;
  const account = await prisma.mailSenderAccount.findUnique({ where: { email: event.senderEmail }, select: { email: true, connectedByUserId: true } });
  return account ? { email: account.email, userId: account.connectedByUserId } : null;
}

export type AutoAcceptOutcome = "pending" | "accepted" | "accepted_sent";

/**
 * Applies the event's autoAccept to freshly created portal/public
 * registrations. Never throws: the parent's registration already exists, a
 * failed send is in the send log like any other. Returns what happened, for
 * the parent's confirmation screen (slice 4 #10).
 */
export async function autoAcceptRegistrations(eventId: string, participantIds: string[], source: RegistrationSource): Promise<AutoAcceptOutcome> {
  if (participantIds.length === 0) return "pending";
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { autoAccept: true, senderEmail: true } });
  if (!event || event.autoAccept === "manual") return "pending";
  const sender = event.autoAccept === "accept_send" ? await eventSender(event) : null;
  const plan = autoAcceptPlan(event.autoAccept, source, !!sender);
  if (!plan.accept) return "pending";
  try {
    if (plan.send && sender) {
      const template = await resolveEmailTemplate(eventId, REGISTRATION_ACCEPTANCE_PURPOSE_KEY);
      await sendBulkParticipantEmail({
        eventId,
        participantIds,
        subject: template.subject,
        body: template.body,
        purposeKey: REGISTRATION_ACCEPTANCE_PURPOSE_KEY,
        sentByUserId: sender.userId,
        markAccepted: true,
      });
      return "accepted_sent";
    }
  } catch (err) {
    console.log(`[auto-accept] acceptance send failed for event ${eventId}:`, String(err));
  }
  // accept, the no-sender fallback, or a send that threw before marking.
  await prisma.participant.updateMany({ where: { id: { in: participantIds } }, data: { registrationStatus: "accepted" } });
  return "accepted";
}
