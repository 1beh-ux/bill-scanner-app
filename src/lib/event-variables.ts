// Event variables registry (Fields Manager phase 1, docs/fields-manager-design/design.md §4, prompt §5): every
// event-level {{key}} documents and e-mails can print, in one list.
//   code       -- built by resolveVariables() today (unchanged); listed here so the template check and the manager
//                 know them without a second hand-kept list
//   linked     -- the same stored value as where it is entered today (event settings / organization), never a copy
//   calculated -- from other values (date_range is "code" for historical reasons, it is calculated too)
//   free       -- EventVariable rows, created in the manager (phase 3)
// Pure (no database): the loader lives in field-resolver.ts.

export type EventVariableKind = "code" | "linked" | "calculated" | "free";
export type EventVariableDef = { key: string; label: string; kind: EventVariableKind; source: string };

/** Keys resolveVariables() builds today -- identical to template-check's former EVENT_KEYS (+ membership_offer_link). */
export const CODE_VARIABLES: EventVariableDef[] = [
  { key: "participant_name", label: "Jméno účastníka", kind: "code", source: "Participant.name" },
  { key: "camp_name", label: "Název akce", kind: "code", source: "Event.name (event settings)" },
  { key: "date_range", label: "Termín akce", kind: "code", source: "Event.startDate – endDate" },
  { key: "sender_email", label: "E-mail odesílatele", kind: "code", source: "Event.senderEmail" },
  { key: "document_checklist", label: "Seznam dokumentů", kind: "code", source: "document types + received" },
  { key: "questionnaire_url", label: "Odkaz na dotazník", kind: "code", source: "Event.mailQuestionnaireUrl" },
  { key: "questionnaire_line", label: "Věta s odkazem na dotazník", kind: "code", source: "Event.mailQuestionnaireUrl" },
  { key: "registration_deadline", label: "Uzávěrka přihlášek", kind: "code", source: "Event.registrationDeadline" },
  { key: "registration_deadline_line", label: "Věta s uzávěrkou", kind: "code", source: "Event.registrationDeadline" },
  { key: "portal_link", label: "Odkaz do portálu", kind: "code", source: "portal token" },
  { key: "portal_link_line", label: "Věta s odkazem do portálu", kind: "code", source: "portal token" },
  { key: "details_link", label: "Odkaz na doplnění údajů", kind: "code", source: "portal / participant link" },
  { key: "details_link_line", label: "Věta s odkazem na doplnění údajů", kind: "code", source: "portal / participant link" },
  { key: "membership_offer_link", label: "Odkaz na nabídku členství", kind: "code", source: "membership join event" },
  { key: "organization_name", label: "Název organizace", kind: "code", source: "Organization.name (organization settings)" },
  { key: "health_notes", label: "Zdravotní poznámky", kind: "code", source: "Event.healthNotes + fields" },
];

/** New with the Fields Manager: linked to where the value is entered today. Printed only with the flag on. */
export const LINKED_VARIABLES: EventVariableDef[] = [
  { key: "date_from", label: "Začátek akce", kind: "linked", source: "Event.startDate" },
  { key: "date_to", label: "Konec akce", kind: "linked", source: "Event.endDate" },
  { key: "place", label: "Místo konání", kind: "linked", source: "Event.location" },
  { key: "price_member", label: "Cena pro členy", kind: "linked", source: "Event.memberPriceCzk" },
  { key: "price_nonmember", label: "Cena pro nečleny", kind: "linked", source: "Event.nonMemberPriceCzk" },
  { key: "bank_account", label: "Číslo účtu pro platbu", kind: "linked", source: "Event registration account, else the bank-module account" },
  { key: "contact_email", label: "Kontaktní e-mail akce", kind: "linked", source: "Event.publicContactEmail, else Organization.contactEmail" },
];

/** Suggested free variables (questions Q14): offered in the manager, stored as EventVariable rows. */
export const SUGGESTED_FREE_VARIABLES: Pick<EventVariableDef, "key" | "label">[] = [
  { key: "leader_name", label: "Hlavní vedoucí" },
  { key: "contact_phone", label: "Kontaktní telefon" },
  { key: "payment_deadline", label: "Termín platby" },
];

/** Old / other names of event variables (questions Q15, prompt §5 `org_name`). One hop, alias -> canonical. */
export const EVENT_VARIABLE_ALIASES: Record<string, string> = {
  org_name: "organization_name",
  event_name: "camp_name",
  event_date: "date_range",
  event_place: "place",
};

export const BUILTIN_EVENT_VARIABLES: EventVariableDef[] = [...CODE_VARIABLES, ...LINKED_VARIABLES];
export const BUILTIN_EVENT_KEYS = new Set(BUILTIN_EVENT_VARIABLES.map((v) => v.key));

/** dd.mm.yyyy in UTC -- the same format documents already use for dates (document-variables.ts formatDate). */
export function formatEventDate(d: Date | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  return `${String(dt.getUTCDate()).padStart(2, "0")}.${String(dt.getUTCMonth() + 1).padStart(2, "0")}.${dt.getUTCFullYear()}`;
}

const czk = (n: number | null | undefined) => (n == null ? "" : `${n} Kč`);

export type LinkedSource = {
  startDate: Date;
  endDate?: Date | null;
  location?: string | null;
  memberPriceCzk?: number | null;
  nonMemberPriceCzk?: number | null;
  registrationBankAccountNumber?: string | null;
  registrationBankCode?: string | null;
  bankAccount?: { accountNumber: string; bankCode: string } | null;
  publicContactEmail?: string | null;
  organizationContactEmail?: string | null;
};

/** Values of the linked variables for one event (pure). Questions Q10: registration account first. */
export function linkedVariableValues(e: LinkedSource): Record<string, string> {
  const account =
    e.registrationBankAccountNumber && e.registrationBankCode
      ? `${e.registrationBankAccountNumber}/${e.registrationBankCode}`
      : e.bankAccount
        ? `${e.bankAccount.accountNumber}/${e.bankAccount.bankCode}`
        : "";
  return {
    date_from: formatEventDate(e.startDate),
    date_to: formatEventDate(e.endDate ?? null),
    place: e.location ?? "",
    price_member: czk(e.memberPriceCzk),
    price_nonmember: czk(e.nonMemberPriceCzk),
    bank_account: account,
    contact_email: e.publicContactEmail || e.organizationContactEmail || "",
  };
}
