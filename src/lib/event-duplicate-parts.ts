// "Duplikovat akci" (2026-10-23): the parts of an event the wizard offers to copy, in order, with what's
// on by default. Pure (the wizard shows it); the copying is src/lib/event-duplicate.ts.
export const DUPLICATE_PARTS = [
  { key: "basics", on: true }, // place, info, questionnaire, sending mailbox, list columns + layouts, health notes, QR size
  { key: "modules", on: true }, // which modules are on
  { key: "categories", on: true }, // receipt categories + budgets
  { key: "fields", on: true }, // participant fields: where shown, order, required at registration
  { key: "documents", on: true }, // document types (Google templates) + the other lists
  { key: "emails", on: true }, // the event's e-mail templates, own e-mails, their attachments
  { key: "payment", on: true }, // prices + price rules, payment account, VS type, auto-accept, Fio check
  { key: "registration", on: true }, // public page text, look, texts, contact; portal rules (closed until opened)
  { key: "tickets", on: true }, // Vstupenky: ticket settings, ticket template
  { key: "planning", on: false }, // the activity library (no days)
  { key: "access", on: false }, // who has which module, receipt authors
  { key: "drive", on: false }, // Google Drive folders and connected sheets
] as const;
export type DuplicatePart = (typeof DUPLICATE_PARTS)[number]["key"];
export const isDuplicatePart = (v: unknown): v is DuplicatePart => DUPLICATE_PARTS.some((p) => p.key === v);
