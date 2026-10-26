import {
  PARENT_SUMMARY_PURPOSE_KEY,
  MAIL_HELPER_BULK_STATUS_PURPOSE_KEY,
  MAIL_HELPER_REPLY_PURPOSE_KEY,
  REGISTRATION_ACCEPTANCE_PURPOSE_KEY,
  REGISTRATION_ACCEPTANCE_PAGE_PURPOSE_KEY,
  REGISTRATION_ACCEPTANCE_PORTAL_PURPOSE_KEY,
  MAIL_HELPER_BULK_STATUS_LINK_PURPOSE_KEY,
  PARTICIPANT_OPEN_EMAIL_PURPOSE_KEY,
  PORTAL_LINK_PURPOSE_KEY,
  PORTAL_INVITATION_PURPOSE_KEY,
  TICKET_ORDER_PURPOSE_KEY,
  TICKET_SEND_PURPOSE_KEY,
  TICKET_CANCEL_PURPOSE_KEY,
  TICKET_DOCUMENT_PURPOSE_KEY,
  isCustomPurpose,
} from "@/lib/email-template-purpose-keys";

// Veřejná akce: every ticket e-mail / the ticket page (src/lib/tickets-server.ts ticketVars).
const ORDER_VARS = ["event_name", "event_date", "event_place", "buyer_name", "order_number", "order_items", "order_total", "ticket_count", "sender_email", "signature", "organization_name"] as const;
const ORDER_DUMMY = {
  event_name: "Ples 2027",
  event_date: "13. 2. 2027",
  event_place: "Sokolovna Brno",
  buyer_name: "Jana Nováková",
  order_number: "12",
  order_items: "2× Vstupné (300 Kč), 1× Student (150 Kč)",
  order_total: "750 Kč",
  ticket_count: "3",
  sender_email: "ples@example.com",
  signature: "S pozdravem\nPořadatelé plesu",
  organization_name: "Turistický oddíl Sluníčko",
  payment_account: "123456789/2010",
  variable_symbol: "2790012",
  payment_amount: "750 Kč",
  payment_message: "Ples 2027 obj 12",
  payment_iban: "CZ65 2010 0000 0001 2345 6789",
  payment_qr: "[QR kód pro platbu]",
  payment_details: "Číslo účtu: 123456789/2010\nČástka: 750 Kč\nVariabilní symbol: 2790012",
  ticket_no: "1",
  ticket_code: "K7QW-3MZP-X9TD",
  price_type: "Vstupné",
  ticket_qr: "[QR kód vstupenky]",
};

// The order's payment (src/lib/tickets-server.ts orderContext); {{payment_qr}} = the QR image in the text.
const PAYMENT_VARS = ["payment_details", "payment_qr", "payment_account", "payment_iban", "payment_amount", "variable_symbol", "payment_message"] as const;

// The participant's family / own portal link (slice 4 #11, src/lib/document-variables.ts
// portalLinkVars) -- in every participant e-mail; empty for events not using the module.
const PORTAL_VARS = ["portal_link", "portal_link_line", "details_link", "details_link_line"] as const;
// The organization's name (organizations step 5) -- in every e-mail, never typed into a template.
const ORG_VARS = ["organization_name"] as const;

// Every e-mail to a participant's people offers the same values (2026-10-22) -- all filled by
// resolveVariables (src/lib/document-variables.ts) + the sender; attachments_list = what got attached.
const PARTICIPANT_VARS = [
  "participant_name",
  "camp_name",
  "date_range",
  "document_checklist",
  "attachments_list",
  "questionnaire_url",
  "questionnaire_line",
  "registration_deadline",
  "registration_deadline_line",
  "health_notes",
  "sender_email",
  "sender_name",
  "signature",
  ...PORTAL_VARS,
  ...ORG_VARS,
] as const;

const VARIABLES_BY_PURPOSE: Record<string, readonly string[]> = {
  [PARENT_SUMMARY_PURPOSE_KEY]: ["child_name", ...PARTICIPANT_VARS],
  [MAIL_HELPER_BULK_STATUS_PURPOSE_KEY]: PARTICIPANT_VARS,
  [MAIL_HELPER_REPLY_PURPOSE_KEY]: [...PARTICIPANT_VARS, "note"],
  // Free e-mail to participants (compose page, "Napsat e-mail") and the own templates.
  [PARTICIPANT_OPEN_EMAIL_PURPOSE_KEY]: PARTICIPANT_VARS,
  [REGISTRATION_ACCEPTANCE_PURPOSE_KEY]: PARTICIPANT_VARS,
  [REGISTRATION_ACCEPTANCE_PAGE_PURPOSE_KEY]: PARTICIPANT_VARS,
  [REGISTRATION_ACCEPTANCE_PORTAL_PURPOSE_KEY]: PARTICIPANT_VARS,
  [MAIL_HELPER_BULK_STATUS_LINK_PURPOSE_KEY]: PARTICIPANT_VARS,
  // Child-level, no event: the child's own profile fields are the other {{key}}s.
  [PORTAL_LINK_PURPOSE_KEY]: ["child_name", "portal_link", "sender_email", "sender_name", "signature", ...ORG_VARS],
  // Yearly invitation (slice 4 #12): same variables as the link e-mail.
  [PORTAL_INVITATION_PURPOSE_KEY]: ["child_name", "portal_link", "sender_email", "sender_name", "signature", ...ORG_VARS],
  [TICKET_ORDER_PURPOSE_KEY]: [...ORDER_VARS, ...PAYMENT_VARS],
  [TICKET_SEND_PURPOSE_KEY]: [...ORDER_VARS, ...PAYMENT_VARS],
  [TICKET_CANCEL_PURPOSE_KEY]: [...ORDER_VARS, ...PAYMENT_VARS],
  [TICKET_DOCUMENT_PURPOSE_KEY]: ["ticket_qr", "ticket_code", "ticket_no", "price_type", ...ORDER_VARS],
};

const PORTAL_DUMMY = {
  // The shared participant values (PARTICIPANT_VARS) for every participant e-mail's sample preview.
  participant_name: "Anna Nováková",
  camp_name: "Letní tábor 2026",
  date_range: "1. 8. 2026 – 7. 8. 2026",
  document_checklist: "- ✅ Přihláška,\n- ❌ Potvrzení od lékaře,",
  attachments_list: "Přihláška, Bezinfekčnost",
  questionnaire_url: "https://forms.example.com/dotaznik",
  questionnaire_line: "Odkaz na vyplnění dotazníku: https://forms.example.com/dotaznik.",
  registration_deadline: "15. 6. 2026",
  registration_deadline_line: "Vyplněné a podepsané dokumenty nám prosím pošlete zpět nejpozději do 15. 6. 2026.",
  health_notes: "Alergie: pyl\nLéky: Zyrtec 1× denně",
  sender_email: "tabor@example.com",
  sender_name: "Pavel",
  signature: "S pozdravem\nPavel, hlavní vedoucí",
  organization_name: "Turistický oddíl Sluníčko",
  portal_link: "https://example.com/p/…",
  portal_link_line: "Vaše přihlášky, dokumenty a platby najdete v rodinném portálu: https://example.com/p/… (při prvním otevření se zeptá na datum narození).",
  details_link: "https://example.com/p/…",
  details_link_line: "Údaje, dokumenty a platbu najdete v rodinném portálu: https://example.com/p/… (při prvním otevření se zeptá na datum narození).",
};

const DUMMY_VALUES_BY_PURPOSE: Record<string, Record<string, string>> = {
  [PARTICIPANT_OPEN_EMAIL_PURPOSE_KEY]: PORTAL_DUMMY,
  [TICKET_ORDER_PURPOSE_KEY]: ORDER_DUMMY,
  [TICKET_SEND_PURPOSE_KEY]: ORDER_DUMMY,
  [TICKET_CANCEL_PURPOSE_KEY]: ORDER_DUMMY,
  [TICKET_DOCUMENT_PURPOSE_KEY]: ORDER_DUMMY,
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
    organization_name: "Turistický oddíl Sluníčko",
    child_name: "Anna Nováková",
    portal_link: "https://example.com/p/…",
    sender_email: "tabor@example.com",
    sender_name: "Pavel",
    signature: "S pozdravem\nPavel, hlavní vedoucí",
  },
  [PORTAL_INVITATION_PURPOSE_KEY]: {
    organization_name: "Turistický oddíl Sluníčko",
    child_name: "Anna Nováková",
    portal_link: "https://example.com/p/…",
    sender_email: "tabor@example.com",
    sender_name: "Pavel",
    signature: "S pozdravem\nPavel, hlavní vedoucí",
  },
  [MAIL_HELPER_BULK_STATUS_LINK_PURPOSE_KEY]: {
    ...PORTAL_DUMMY,
    participant_name: "Anna Nováková",
    camp_name: "Letní tábor 2026",
    document_checklist: "- ✅ Přihláška,\n- ❌ Potvrzení od lékaře,",
    sender_name: "Pošta táboru",
    signature: "S pozdravem\nPošta táboru",
  },
  [REGISTRATION_ACCEPTANCE_PORTAL_PURPOSE_KEY]: {
    ...PORTAL_DUMMY,
    participant_name: "Anna Nováková",
    camp_name: "Letní tábor 2026",
    sender_name: "Pavel",
    signature: "S pozdravem\nPavel, hlavní vedoucí",
  },
  [REGISTRATION_ACCEPTANCE_PAGE_PURPOSE_KEY]: {
    ...PORTAL_DUMMY,
    participant_name: "Anna Nováková",
    camp_name: "Letní tábor 2026",
    details_link: "https://example.com/u/…",
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
  if (isCustomPurpose(purposeKey)) purposeKey = PARTICIPANT_OPEN_EMAIL_PURPOSE_KEY;
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
  if (isCustomPurpose(purposeKey)) purposeKey = PARTICIPANT_OPEN_EMAIL_PURPOSE_KEY;
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
