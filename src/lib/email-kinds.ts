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
  MAIL_HELPER_BULK_STATUS_PURPOSE_KEY,
  MAIL_HELPER_REPLY_PURPOSE_KEY,
} from "@/lib/email-template-purpose-keys";

export type EmailKind = {
  purposeKey: string;
  // emailKinds.<id>.name / .what (what it is for) / .where (why it's launched elsewhere)
  id: string;
  launch: "compose" | "portal" | "elsewhere";
  launchHref?: (eventId: string) => string;
  // Module needed to edit / send it (roster = health or mail).
  module: "health" | "mail" | "roster";
  // No stored template (the blank e-mail).
  noTemplate?: boolean;
  // Template only at organization level (sent outside one event's settings).
  orgOnly?: boolean;
  bodyOnly?: boolean;
};

export const EMAIL_KINDS: EmailKind[] = [
  { purposeKey: PARTICIPANT_OPEN_EMAIL_PURPOSE_KEY, id: "blank", launch: "compose", module: "roster", noTemplate: true },
  { purposeKey: PORTAL_INVITATION_PURPOSE_KEY, id: "portalInvitation", launch: "portal", module: "roster", orgOnly: true },
  { purposeKey: PORTAL_LINK_PURPOSE_KEY, id: "portalLink", launch: "portal", module: "roster", orgOnly: true },
  { purposeKey: PARENT_SUMMARY_PURPOSE_KEY, id: "healthSummary", launch: "elsewhere", launchHref: (id) => `/events/${id}/health/send-summaries`, module: "health" },
  { purposeKey: REGISTRATION_ACCEPTANCE_PURPOSE_KEY, id: "acceptance", launch: "elsewhere", launchHref: (id) => `/events/${id}/participants`, module: "roster" },
  { purposeKey: MAIL_HELPER_BULK_STATUS_PURPOSE_KEY, id: "documentStatus", launch: "elsewhere", launchHref: (id) => `/events/${id}/participants/documents`, module: "mail" },
  { purposeKey: MAIL_HELPER_REPLY_PURPOSE_KEY, id: "mailReply", launch: "elsewhere", launchHref: (id) => `/events/${id}/mail`, module: "mail", bodyOnly: true },
];

/** Where the template is edited: the event's Pošta settings, or the organization's templates. */
export const templateEditHref = (eventId: string, k: { purposeKey: string; orgOnly?: boolean }) =>
  k.orgOnly ? "/templates?tab=emails" : `/events/${eventId}?tab=posta#tpl-${k.purposeKey}`;

export const kindAllowed = (k: { module: EmailKind["module"] }, access: Record<string, boolean>) =>
  k.module === "roster" ? !!(access.health || access.mail) : !!access[k.module];
