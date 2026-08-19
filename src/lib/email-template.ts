import { prisma } from "@/lib/prisma";
import type { ModuleKey } from "@/generated/prisma";
import {
  PARENT_SUMMARY_PURPOSE_KEY,
  MAIL_HELPER_BULK_STATUS_PURPOSE_KEY,
  MAIL_HELPER_REPLY_PURPOSE_KEY,
} from "@/lib/email-template-purpose-keys";

// Re-exported for existing server-side callers -- client components must
// import these from email-template-purpose-keys.ts directly instead (see
// that file's comment): this module pulls in prisma and can't be imported
// from a "use client" component without leaking a Node-only dependency
// (pg's `dns` usage) into the browser bundle.
export { PARENT_SUMMARY_PURPOSE_KEY, MAIL_HELPER_BULK_STATUS_PURPOSE_KEY, MAIL_HELPER_REPLY_PURPOSE_KEY };

const PURPOSE_DEFAULTS: Record<string, { subject: string; body: string }> = {
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

Pokud něco chybí, prosím o poslání v odpovědi na tento email. Odkaz na vyplnění dotazníku: {{questionnaire_url}}.

Děkujeme,
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
export function moduleForEmailPurpose(purposeKey: string): ModuleKey {
  return purposeKey === MAIL_HELPER_BULK_STATUS_PURPOSE_KEY ? "mail" : "health";
}

/** The single org-default row for this purpose, created on first read if missing. */
export async function getOrCreateOrgEmailTemplate(purposeKey: string = PARENT_SUMMARY_PURPOSE_KEY) {
  const { subject, body } = defaultsFor(purposeKey);
  return prisma.emailTemplate.upsert({
    where: { purposeKey },
    update: {},
    create: { purposeKey, subject, body },
  });
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

  const org = await getOrCreateOrgEmailTemplate(purposeKey);
  return { subject: org.subject, body: org.body };
}

export function substituteVariables(text: string, vars: Record<string, string>): string {
  let out = text;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}
