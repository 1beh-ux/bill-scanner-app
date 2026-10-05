import {
  PARENT_SUMMARY_PURPOSE_KEY,
  MAIL_HELPER_BULK_STATUS_PURPOSE_KEY,
  MAIL_HELPER_REPLY_PURPOSE_KEY,
  REGISTRATION_ACCEPTANCE_PURPOSE_KEY,
  PARTICIPANT_OPEN_EMAIL_PURPOSE_KEY,
  PORTAL_LINK_PURPOSE_KEY,
  PORTAL_INVITATION_PURPOSE_KEY,
} from "@/lib/email-template-purpose-keys";

// The participant's family / own portal link (slice 4 #11, src/lib/document-variables.ts
// portalLinkVars) -- in every participant e-mail; empty for events not using the module.
const PORTAL_VARS = ["portal_link", "portal_link_line"] as const;

const VARIABLES_BY_PURPOSE: Record<string, readonly string[]> = {
  [PARENT_SUMMARY_PURPOSE_KEY]: ["child_name", "camp_name", "date_range", "health_notes", "sender_name", "signature", ...PORTAL_VARS],
  [MAIL_HELPER_BULK_STATUS_PURPOSE_KEY]: [
    "participant_name",
    "camp_name",
    "document_checklist",
    "questionnaire_url",
    "sender_name",
    "signature",
    ...PORTAL_VARS,
  ],
  [MAIL_HELPER_REPLY_PURPOSE_KEY]: ["participant_name", "camp_name", "document_checklist", "questionnaire_line", "questionnaire_url", "note", "sender_name", "signature", ...PORTAL_VARS],
  // Free e-mail to participants (compose page, "Napsat e-mail").
  [PARTICIPANT_OPEN_EMAIL_PURPOSE_KEY]: ["participant_name", "camp_name", "health_notes", "sender_email", "sender_name", "signature", ...PORTAL_VARS],
  [REGISTRATION_ACCEPTANCE_PURPOSE_KEY]: ["participant_name", "camp_name", "attachments_list", "registration_deadline", "registration_deadline_line", "sender_email", "sender_name", "signature", ...PORTAL_VARS],
  // Child-level, no event: the child's own profile fields are the other {{key}}s.
  [PORTAL_LINK_PURPOSE_KEY]: ["child_name", "portal_link", "sender_email", "sender_name", "signature"],
  // Yearly invitation (slice 4 #12): same variables as the link e-mail.
  [PORTAL_INVITATION_PURPOSE_KEY]: ["child_name", "portal_link", "sender_email", "sender_name", "signature"],
};

const PORTAL_DUMMY = {
  portal_link: "https://example.com/p/…",
  portal_link_line: "Vaše přihlášky, dokumenty a platby najdete v rodinném portálu: https://example.com/p/… (při prvním otevření se zeptá na datum narození).",
};

const DUMMY_VALUES_BY_PURPOSE: Record<string, Record<string, string>> = {
  [MAIL_HELPER_REPLY_PURPOSE_KEY]: {
    ...PORTAL_DUMMY,
    participant_name: "Anna Nováková",
    camp_name: "Letní tábor 2026",
    document_checklist: "- ✔ Přihláška — doručeno\n- ✖ Potvrzení od lékaře — chybí",
    questionnaire_line: "Odkaz na vyplnění dotazníku: https://forms.example.com/dotaznik.",
    questionnaire_url: "https://forms.example.com/dotaznik",
    note: "(poznámka z Pošty)",
    sender_name: "Pošta táboru",
    signature: "S pozdravem\nPošta táboru",
  },
  [PARENT_SUMMARY_PURPOSE_KEY]: {
    ...PORTAL_DUMMY,
    child_name: "Anna Nováková",
    camp_name: "Letní tábor 2026",
    date_range: "1.–7. 8. 2026",
    health_notes: "Alergie: pyl\nLéky: Zyrtec 1× denně",
    sender_name: "Zdravotník",
    signature: "S pozdravem\nZdravotník tábora",
  },
  [MAIL_HELPER_BULK_STATUS_PURPOSE_KEY]: {
    ...PORTAL_DUMMY,
    participant_name: "Anna Nováková",
    camp_name: "Letní tábor 2026",
    document_checklist: "- ✅ Přihláška,\n- ❌ Potvrzení od lékaře,",
    questionnaire_url: "https://forms.example.com/dotaznik",
    sender_name: "Pošta táboru",
    signature: "S pozdravem\nPošta táboru",
  },
  [PORTAL_LINK_PURPOSE_KEY]: {
    child_name: "Anna Nováková",
    portal_link: "https://example.com/p/…",
    sender_email: "tabor@example.com",
    sender_name: "Pavel",
    signature: "S pozdravem\nPavel, hlavní vedoucí",
  },
  [PORTAL_INVITATION_PURPOSE_KEY]: {
    child_name: "Anna Nováková",
    portal_link: "https://example.com/p/…",
    sender_email: "tabor@example.com",
    sender_name: "Pavel",
    signature: "S pozdravem\nPavel, hlavní vedoucí",
  },
  [REGISTRATION_ACCEPTANCE_PURPOSE_KEY]: {
    ...PORTAL_DUMMY,
    participant_name: "Anna Nováková",
    camp_name: "Letní tábor 2026",
    sender_name: "Pavel",
    signature: "S pozdravem\nPavel, hlavní vedoucí",
  },
};

// Back-compat exports for callers that haven't been threaded to a purposeKey yet.
export const TEMPLATE_VARIABLES = VARIABLES_BY_PURPOSE[PARENT_SUMMARY_PURPOSE_KEY];
export const TEMPLATE_DUMMY_VALUES = DUMMY_VALUES_BY_PURPOSE[PARENT_SUMMARY_PURPOSE_KEY];

export function templateVariablesFor(purposeKey: string): readonly string[] {
  return VARIABLES_BY_PURPOSE[purposeKey] ?? VARIABLES_BY_PURPOSE[PARENT_SUMMARY_PURPOSE_KEY];
}

// `extraDummyValues` covers the dynamic participant fields (custom/
// builtin/guardian/computed, anything with the `documents` surface --
// see src/lib/fixed-participant-fields.ts) that EmailTemplateAdmin adds
// to the fixed purpose-specific list below, keyed by field key with the
// field's own label as a readable placeholder (there's no real
// participant to preview against while editing a template).
export function substituteDummyTemplateValues(
  text: string,
  purposeKey: string = PARENT_SUMMARY_PURPOSE_KEY,
  extraDummyValues: Record<string, string> = {}
): string {
  const variables = templateVariablesFor(purposeKey);
  const dummyValues = {
    ...(DUMMY_VALUES_BY_PURPOSE[purposeKey] ?? DUMMY_VALUES_BY_PURPOSE[PARENT_SUMMARY_PURPOSE_KEY]),
    ...extraDummyValues,
  };
  let out = text;
  for (const key of [...variables, ...Object.keys(extraDummyValues)]) {
    out = out.replaceAll(`{{${key}}}`, dummyValues[key] ?? "");
  }
  return out;
}
