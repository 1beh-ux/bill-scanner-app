import {
  PARENT_SUMMARY_PURPOSE_KEY,
  MAIL_HELPER_BULK_STATUS_PURPOSE_KEY,
  REGISTRATION_ACCEPTANCE_PURPOSE_KEY,
} from "@/lib/email-template-purpose-keys";

const VARIABLES_BY_PURPOSE: Record<string, readonly string[]> = {
  [PARENT_SUMMARY_PURPOSE_KEY]: ["child_name", "camp_name", "date_range", "sender_name"],
  [MAIL_HELPER_BULK_STATUS_PURPOSE_KEY]: [
    "participant_name",
    "camp_name",
    "document_checklist",
    "questionnaire_url",
    "sender_name",
  ],
  [REGISTRATION_ACCEPTANCE_PURPOSE_KEY]: ["participant_name", "camp_name", "sender_name"],
};

const DUMMY_VALUES_BY_PURPOSE: Record<string, Record<string, string>> = {
  [PARENT_SUMMARY_PURPOSE_KEY]: {
    child_name: "Anna Nováková",
    camp_name: "Letní tábor 2026",
    date_range: "1.–7. 8. 2026",
    sender_name: "Zdravotník",
  },
  [MAIL_HELPER_BULK_STATUS_PURPOSE_KEY]: {
    participant_name: "Anna Nováková",
    camp_name: "Letní tábor 2026",
    document_checklist: "- ✅ Přihláška,\n- ❌ Potvrzení od lékaře,",
    questionnaire_url: "https://forms.example.com/dotaznik",
    sender_name: "Pošta táboru",
  },
  [REGISTRATION_ACCEPTANCE_PURPOSE_KEY]: {
    participant_name: "Anna Nováková",
    camp_name: "Letní tábor 2026",
    sender_name: "Pavel",
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
