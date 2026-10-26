// Every e-mail the app sends, in one list (client-safe, no imports beyond the keys):
// Účastníci -> Poslat e-mail shows it as its submenu, Nastavení akce -> Pošta and
// Šablony -> Šablony e-mailů edit the templates in this order.
//   compose   -- sent from Poslat e-mail to the participants you pick (open e-mail page)
//   portal    -- the parent-portal link / invitation, to the picked participants' people (Lidé)
//   elsewhere -- an answer to something specific: launched where that happens (`launchHref`)
import {
  PARTICIPANT_OPEN_EMAIL_PURPOSE_KEY,
  PORTAL_INVITATION_PURPOSE_KEY,
  PORTAL_LINK_PURPOSE_KEY,
  PARENT_SUMMARY_PURPOSE_KEY,
  REGISTRATION_ACCEPTANCE_PURPOSE_KEY,
  REGISTRATION_ACCEPTANCE_PAGE_PURPOSE_KEY,
  REGISTRATION_ACCEPTANCE_PORTAL_PURPOSE_KEY,
  MAIL_HELPER_BULK_STATUS_PURPOSE_KEY,
  MAIL_HELPER_BULK_STATUS_LINK_PURPOSE_KEY,
  MAIL_HELPER_REPLY_PURPOSE_KEY,
} from "@/lib/email-template-purpose-keys";

export type EmailKind = {
  purposeKey: string;
  // emailKinds.<id>.name / .what (what it is for) / .where (why it's launched elsewhere)
  id: string;
  launch: "compose" | "portal" | "elsewhere";
  launchHref?: (eventId: string) => string;
  // Module needed to edit / send it (roster = participants, health or mail).
  module: "health" | "mail" | "roster";
  // No stored template (the blank e-mail).
  noTemplate?: boolean;
  // Template only at organization level (sent outside one event's settings).
  orgOnly?: boolean;
  bodyOnly?: boolean;
  // Which events use it (eventTemplateKey): only those with the parent portal, or only those without.
  // The organization keeps every case; an event's Pošta shows the ones of its own case.
  when?: "portal" | "noPortal";
};

export const EMAIL_KINDS: EmailKind[] = [
  { purposeKey: PARTICIPANT_OPEN_EMAIL_PURPOSE_KEY, id: "blank", launch: "compose", module: "roster", noTemplate: true },
  { purposeKey: PORTAL_INVITATION_PURPOSE_KEY, id: "portalInvitation", launch: "portal", module: "roster", orgOnly: true },
  { purposeKey: PORTAL_LINK_PURPOSE_KEY, id: "portalLink", launch: "portal", module: "roster", orgOnly: true },
  { purposeKey: PARENT_SUMMARY_PURPOSE_KEY, id: "healthSummary", launch: "elsewhere", launchHref: (id) => `/events/${id}/health/send-summaries`, module: "health" },
  { purposeKey: REGISTRATION_ACCEPTANCE_PURPOSE_KEY, id: "acceptance", launch: "elsewhere", launchHref: (id) => `/events/${id}/participants`, module: "roster", when: "noPortal" },
  { purposeKey: REGISTRATION_ACCEPTANCE_PORTAL_PURPOSE_KEY, id: "acceptancePortal", launch: "elsewhere", launchHref: (id) => `/events/${id}/participants`, module: "roster", when: "portal" },
  // Sent instead of the acceptance to participants not in Členové (src/lib/participant-bulk-email.ts).
  { purposeKey: REGISTRATION_ACCEPTANCE_PAGE_PURPOSE_KEY, id: "acceptancePage", launch: "elsewhere", launchHref: (id) => `/events/${id}/participants`, module: "roster", when: "portal" },
  { purposeKey: MAIL_HELPER_BULK_STATUS_PURPOSE_KEY, id: "documentStatus", launch: "elsewhere", launchHref: (id) => `/events/${id}/participants/documents`, module: "roster", when: "noPortal" },
  { purposeKey: MAIL_HELPER_BULK_STATUS_LINK_PURPOSE_KEY, id: "documentStatusLink", launch: "elsewhere", launchHref: (id) => `/events/${id}/participants/documents`, module: "roster", when: "portal" },
  { purposeKey: MAIL_HELPER_REPLY_PURPOSE_KEY, id: "mailReply", launch: "elsewhere", launchHref: (id) => `/events/${id}/mail`, module: "mail", bodyOnly: true },
];

/** An event with the parent portal: connected to registration, or a membership year (as {{portal_link}}). */
export const usesPortal = (e: { registrationConnected: boolean; kind: string }) => e.registrationConnected || e.kind === "membership";

/** The template an event actually sends for an e-mail: the portal case of the acceptance / status e-mail in a portal event. */
export function eventTemplateKey(e: { registrationConnected: boolean; kind: string }, purposeKey: string): string {
  if (!usesPortal(e)) return purposeKey;
  if (purposeKey === REGISTRATION_ACCEPTANCE_PURPOSE_KEY) return REGISTRATION_ACCEPTANCE_PORTAL_PURPOSE_KEY;
  if (purposeKey === MAIL_HELPER_BULK_STATUS_PURPOSE_KEY) return MAIL_HELPER_BULK_STATUS_LINK_PURPOSE_KEY;
  return purposeKey;
}

/** Whether an event uses this kind (its Pošta / Poslat e-mail list it). */
export const kindForEvent = (k: { when?: "portal" | "noPortal" }, e: { registrationConnected: boolean; kind: string }) => !k.when || (k.when === "portal") === usesPortal(e);

/** Where the template is edited: the event's Pošta settings, or the organization's templates. */
export const templateEditHref = (eventId: string, k: { purposeKey: string; orgOnly?: boolean }) =>
  k.orgOnly ? "/templates?tab=emails" : `/events/${eventId}?tab=posta#tpl-${k.purposeKey}`;

export const kindAllowed = (k: { module: EmailKind["module"] }, access: Record<string, boolean>) =>
  k.module === "roster" ? !!(access.participants || access.health || access.mail) : !!access[k.module];
