import { orgIdOfEvent } from "@/lib/org-owner";
import { prisma } from "@/lib/prisma";
import type { ModuleKey } from "@/generated/prisma";
import {
  PARENT_SUMMARY_PURPOSE_KEY,
  MAIL_HELPER_BULK_STATUS_PURPOSE_KEY,
  MAIL_HELPER_REPLY_PURPOSE_KEY,
  REGISTRATION_ACCEPTANCE_PURPOSE_KEY,
  PARTICIPANT_OPEN_EMAIL_PURPOSE_KEY,
  PORTAL_LINK_PURPOSE_KEY,
  PORTAL_INVITATION_PURPOSE_KEY,
} from "@/lib/email-template-purpose-keys";

// Re-exported for existing server-side callers -- client components must
// import these from email-template-purpose-keys.ts directly instead (see
// that file's comment): this module pulls in prisma and can't be imported
// from a "use client" component without leaking a Node-only dependency
// (pg's `dns` usage) into the browser bundle.
export {
  PARENT_SUMMARY_PURPOSE_KEY,
  MAIL_HELPER_BULK_STATUS_PURPOSE_KEY,
  MAIL_HELPER_REPLY_PURPOSE_KEY,
  REGISTRATION_ACCEPTANCE_PURPOSE_KEY,
};

// Exported for scripts/fix-registration-acceptance-template.ts, which needs to know
// the real default text without duplicating it.
export const PURPOSE_DEFAULTS: Record<string, { subject: string; body: string }> = {
  // Parent portal link (src/app/api/children/portal-email/route.ts) -- org level, no event.
  [PORTAL_LINK_PURPOSE_KEY]: {
    subject: "Odkaz do portálu rodičů – {{child_name}}",
    body: `Dobrý den,

posíláme odkaz do portálu rodičů pro {{child_name}}:

{{portal_link}}

V portálu uvidíte údaje dítěte, můžete je opravit a přihlásit dítě na akce, které jsou právě otevřené. Při prvním otevření budete požádáni o datum narození dítěte. Odkaz prosím nikomu dalšímu neposílejte.

S pozdravem
{{signature}}`,
  },
  // Yearly invitation / onboarding existing people (slice 4 #12) -- same send as the link.
  [PORTAL_INVITATION_PURPOSE_KEY]: {
    subject: "Rodinný portál – {{child_name}}",
    body: `Dobrý den,

posíláme odkaz do našeho rodinného portálu pro {{child_name}}:

{{portal_link}}

Co v portálu najdete:
- údaje o členech rodiny a kontakty na zákonné zástupce — můžete je sami opravit,
- přihlášky na akce, které jsou právě otevřené, a stav těch, na které jste přihlášeni (dokumenty, platba),
- přehled akcí, kterých jste se účastnili v minulých letech (sekce „Historie“).

Při prvním otevření se portál zeptá na datum narození některého člena rodiny — tím ověříme, že jde o vás. Na stejném zařízení se pak už ptát nebude.

Členství na nový rok obnovíte přímo v portálu: u členství na nový rok klikněte na „Obnovit členství“, zaškrtněte, koho přihlašujete, a potvrďte. Cenu uvidíte předem.

Odkaz prosím nikomu dalšímu neposílejte.

S pozdravem
{{signature}}`,
  },
  // Pošta reply (the subject is always "Re: <their subject>", so only the body
  // is edited). Empty {{questionnaire_line}}/{{note}} lines collapse on send.
  [MAIL_HELPER_REPLY_PURPOSE_KEY]: {
    subject: "Re: …",
    body: `Dobrý den,

Děkujeme za zaslání a posíláme potvrzení o aktuálním stavu dokumentů:

{{document_checklist}}

{{questionnaire_line}}

{{note}}

Děkujeme za důvěru,

{{signature}}`,
  },
  [PARENT_SUMMARY_PURPOSE_KEY]: {
    subject: "Souhrn zdravotních záznamů – {{child_name}} – {{camp_name}}",
    body: `Dobrý den,

v příloze zasíláme souhrn zdravotních záznamů pro {{child_name}} z akce {{camp_name}} ({{date_range}}).

S pozdravem,
{{sender_name}}`,
  },
  [MAIL_HELPER_BULK_STATUS_PURPOSE_KEY]: {
    subject: "{{camp_name}} | Stav dokumentů ({{participant_name}})",
    body: `Dobrý den,

posíláme průběžnou informaci ke stavu podkladů pro dítě: {{participant_name}}

{{document_checklist}}

Pokud něco chybí, prosím o poslání v odpovědi na tento email.

{{questionnaire_line}}

Děkujeme,
{{sender_name}}`,
  },
  [REGISTRATION_ACCEPTANCE_PURPOSE_KEY]: {
    // {{registration_deadline_line}} is a whole sentence (empty when the event has
    // no deadline -- see resolveVariables in document-variables.ts);
    // {{registration_deadline}} alone is just the date. {{attachments_list}} is
    // built from whatever actually got attached to this specific send.
    subject: "Přijetí registrace: {{participant_name}} — {{camp_name}}",
    body: `Dobrý den,

s radostí potvrzujeme přijetí {{participant_name}} na akci {{camp_name}}.

V příloze najdete: {{attachments_list}}.

{{registration_deadline_line}}

Kdyby cokoli nebylo jasné, ozvěte se na {{sender_email}}.

S pozdravem
{{sender_name}}`,
  },
};

// Back-compat default for callers that still pass no purposeKey.
export const DEFAULT_EMAIL_SUBJECT = PURPOSE_DEFAULTS[PARENT_SUMMARY_PURPOSE_KEY].subject;
export const DEFAULT_EMAIL_BODY = PURPOSE_DEFAULTS[PARENT_SUMMARY_PURPOSE_KEY].body;

function defaultsFor(purposeKey: string): { subject: string; body: string } {
  const defaults = PURPOSE_DEFAULTS[purposeKey];
  if (!defaults) throw new Error(`unknown_email_purpose_key: ${purposeKey}`);
  return defaults;
}

/** Which module's access grant should gate a given email-template purpose key. */
/**
 * The two personal signatures (Nastavení -> personal settings): `name` is the
 * From display name and {{sender_name}}; `signature` is the multi-line
 * signature for the e-mail text, {{signature}}, falling back to `name`.
 */
export function senderIdentity(
  user: { emailSignature: string | null; emailBodySignature: string | null; displayName: string } | null,
  fallback: string
): { name: string; signature: string } {
  const name = user?.emailSignature || user?.displayName || fallback;
  return { name, signature: user?.emailBodySignature || name };
}

// Acceptance / open e-mails belong to the central participant roster, which
// health or mail access reaches (same as the bulk-email send route).
export function modulesForEmailPurpose(purposeKey: string): ModuleKey[] {
  if (purposeKey === MAIL_HELPER_BULK_STATUS_PURPOSE_KEY || purposeKey === MAIL_HELPER_REPLY_PURPOSE_KEY) return ["mail"];
  if (purposeKey === REGISTRATION_ACCEPTANCE_PURPOSE_KEY || purposeKey === PARTICIPANT_OPEN_EMAIL_PURPOSE_KEY) return ["health", "mail"];
  return ["health"];
}

/** The organization's default row for this purpose, created on first read if missing. */
export async function getOrCreateOrgEmailTemplate(organizationId: string | null, purposeKey: string = PARENT_SUMMARY_PURPOSE_KEY) {
  const { subject, body } = defaultsFor(purposeKey);
  // Find + create, not upsert: Prisma's upsert is INSERT ... ON CONFLICT (purpose_key),
  // which fails once organizations_required replaces that unique (deploy window).
  const existing = await prisma.emailTemplate.findFirst({ where: { purposeKey } });
  return existing ?? prisma.emailTemplate.create({ data: { purposeKey, subject, body, organizationId } });
}

/** Event override if one exists, otherwise the org default -- used at send time. */
export async function resolveEmailTemplate(
  eventId: string,
  purposeKey: string = PARENT_SUMMARY_PURPOSE_KEY
): Promise<{ subject: string; body: string }> {
  const override = await prisma.eventEmailTemplate.findUnique({
    where: { eventId_purposeKey: { eventId, purposeKey } },
  });
  if (override) return { subject: override.subject, body: override.body };

  const org = await getOrCreateOrgEmailTemplate(await orgIdOfEvent(eventId), purposeKey);
  return { subject: org.subject, body: org.body };
}

export function substituteVariables(text: string, vars: Record<string, string>): string {
  let out = text;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}
