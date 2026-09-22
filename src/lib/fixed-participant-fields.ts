import type { ParticipantFieldSurface, ParticipantFieldType, ComputedFieldType } from "@/generated/prisma";

// Deliberately prisma-free -- this constant is imported by client
// components too (the import-mapping page needs builtinProp/guardianProp
// to resolve targets), so pulling in `@/lib/prisma` here would drag
// server-only code into the browser bundle. The DB-touching seed helper
// lives in src/lib/participant-field-seed.ts instead.
export type FixedFieldDef = {
  key: string;
  kind: "builtin" | "guardian" | "computed";
  fieldType: ParticipantFieldType;
  label: string;
  defaultSurfaces: ParticipantFieldSurface[];
  builtinProp?: "name" | "firstName" | "lastName" | "groupName" | "dateOfBirth" | "registrationStatus";
  guardianProp?: "name" | "email" | "relationship" | "phone";
  computedType?: ComputedFieldType;
};

// The fixed, non-deletable rows every event gets alongside its custom
// fields -- one unified list instead of a separate MergeVariable registry.
// Keys for the builtin/guardian/computed rows are NOT free to rename: they
// match, 1:1, the {{key}} placeholders already baked into the real
// production document templates (Pavel's Drive "Templaty" folder), lifted
// verbatim from the old scripts/seed-document-merge-variables.ts. Two
// guardian-name rows (zast_jmeno / zak_zast_jmeno) exist because the two
// live templates never agreed on a name for that field -- both resolve the
// same guardian.name value.
export const FIXED_PARTICIPANT_FIELDS: FixedFieldDef[] = [
  {
    key: "Name",
    kind: "builtin",
    fieldType: "text",
    label: "Jméno a příjmení dítěte",
    builtinProp: "name",
    defaultSurfaces: ["list", "health_list", "health_detail", "mail_list", "documents", "import"],
  },
  {
    // New (Part 1 of the participants/settings prompt) -- name/surname split into
    // dedicated fields, kept separate from the "Name" row above (which stays the
    // maintained full display name -- see the Participant.name schema comment)
    // so existing document templates keyed on {{Name}} are untouched.
    key: "participant_first_name",
    kind: "builtin",
    fieldType: "text",
    label: "Jméno (křestní)",
    builtinProp: "firstName",
    defaultSurfaces: ["documents", "import"],
  },
  {
    key: "participant_last_name",
    kind: "builtin",
    fieldType: "text",
    label: "Příjmení",
    builtinProp: "lastName",
    defaultSurfaces: ["documents", "import"],
  },
  {
    key: "datum_narozeni",
    kind: "builtin",
    fieldType: "date",
    label: "Datum narození",
    builtinProp: "dateOfBirth",
    defaultSurfaces: ["list", "documents", "import"],
  },
  {
    key: "skupina",
    kind: "builtin",
    fieldType: "text",
    label: "Skupina",
    builtinProp: "groupName",
    defaultSurfaces: ["list", "import"],
  },
  {
    key: "registrace",
    kind: "builtin",
    fieldType: "text",
    label: "Stav registrace",
    builtinProp: "registrationStatus",
    defaultSurfaces: ["list"],
  },
  {
    key: "zast_jmeno",
    kind: "guardian",
    fieldType: "text",
    label: "Jméno zákonného zástupce",
    guardianProp: "name",
    defaultSurfaces: ["documents", "import"],
  },
  {
    key: "zak_zast_jmeno",
    kind: "guardian",
    fieldType: "text",
    label: "Jméno zákonného zástupce (posudek)",
    guardianProp: "name",
    defaultSurfaces: ["documents"],
  },
  {
    key: "vztah",
    kind: "guardian",
    fieldType: "text",
    label: "Vztah k dítěti",
    guardianProp: "relationship",
    defaultSurfaces: ["documents", "import"],
  },
  {
    key: "zast_telefon",
    kind: "guardian",
    fieldType: "text",
    label: "Telefon zákonného zástupce",
    guardianProp: "phone",
    defaultSurfaces: ["documents", "import"],
  },
  {
    // Kind changed from "guardian" (plain guardians[0].email) to "computed"
    // (Part 1: first guardian with receivesCommunications, else the first) --
    // the key stays "Email" so existing document templates keyed on
    // {{Email}} keep resolving, just to a better-chosen address.
    key: "Email",
    kind: "computed",
    fieldType: "text",
    label: "Kontaktní e-mail",
    computedType: "contact_email",
    // Not used for merge (kind=computed takes over that) -- kept so the import page's
    // "guardian e-mail" mapping target (matched by guardianProp, see participants/import/
    // page.tsx) still resolves to this field's key ("Email"); import always writes a real
    // ParticipantGuardian row, never this computed field.
    guardianProp: "email",
    defaultSurfaces: ["list", "mail_list", "documents", "import"],
  },
  {
    key: "price",
    kind: "computed",
    fieldType: "number",
    label: "Cena (dle členství)",
    computedType: "effective_price",
    defaultSurfaces: ["documents"],
  },
  {
    key: "var_symb",
    kind: "computed",
    fieldType: "text",
    label: "Variabilní symbol platby",
    computedType: "variable_symbol",
    defaultSurfaces: ["documents"],
  },
  {
    key: "picture",
    kind: "computed",
    fieldType: "image",
    label: "QR kód pro platbu",
    computedType: "payment_qr_image",
    defaultSurfaces: ["documents"],
  },
];
