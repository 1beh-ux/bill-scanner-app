// Guardian fields (2026-11-26): the organization's own properties of a guardian ("Souhlas", "Zaměstnavatel"...),
// defined once and asked for EVERY guardian. Normal field types and options; the values live on the guardian
// (ChildGuardian.extra / ParticipantGuardian.extra = { key: value }) and print as {{guardian<N>_<key>}}.
// Organization.guardianProps = { fixedRequired: { phone, relationship }, fields: [...] }; per event
// Event.guardianForm = { <key | "phone" | "relationship">: { ask?, required?, label?, hint? } }.
// Pure -- no DB (used by the forms, the portal and the admin screens too).
import { cleanFieldValue } from "@/lib/registration-fields";

export const GUARDIAN_FIELD_TYPES = ["text", "longtext", "number", "date", "boolean", "select", "multi", "consent", "email", "phone"] as const;
export type GuardianFieldType = (typeof GUARDIAN_FIELD_TYPES)[number];
export type GuardianFieldDef = { key: string; label: string; fieldType: GuardianFieldType; options: string[] | null; required: boolean };
export type GuardianSettings = { fixedRequired: { phone: boolean; relationship: boolean }; fields: GuardianFieldDef[] };
export type GuardianFormCfg = { ask?: boolean; required?: boolean; label?: string; hint?: string };
export type GuardianForm = Record<string, GuardianFormCfg>;

/** Keys a guardian already has (and the guardian<N>_ props the resolver knows) -- not free for an own field. */
export const FIXED_GUARDIAN_KEYS = ["name", "email", "phone", "relation", "relationship", "mail"];
export const GUARDIAN_KEY = /^[a-z][a-z0-9_]{0,39}$/;

const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function readGuardianSettings(raw: unknown): GuardianSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const fr = (o.fixedRequired && typeof o.fixedRequired === "object" ? o.fixedRequired : {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const fields: GuardianFieldDef[] = [];
  for (const f of Array.isArray(o.fields) ? o.fields : []) {
    const r = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
    const key = str(r.key, 40);
    if (!GUARDIAN_KEY.test(key) || FIXED_GUARDIAN_KEYS.includes(key) || seen.has(key)) continue;
    seen.add(key);
    const fieldType = (GUARDIAN_FIELD_TYPES as readonly string[]).includes(r.fieldType as string) ? (r.fieldType as GuardianFieldType) : "text";
    const options = Array.isArray(r.options) ? r.options.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()) : null;
    fields.push({ key, label: str(r.label) || key, fieldType, options: fieldType === "select" || fieldType === "multi" ? options ?? [] : null, required: bool(r.required, false) });
  }
  return { fixedRequired: { phone: bool(fr.phone, false), relationship: bool(fr.relationship, false) }, fields };
}

export function readGuardianForm(raw: unknown): GuardianForm {
  const out: GuardianForm = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    out[k] = {
      ...(typeof r.ask === "boolean" && { ask: r.ask }),
      ...(typeof r.required === "boolean" && { required: r.required }),
      ...(str(r.label) && { label: str(r.label) }),
      ...(str(r.hint, 300) && { hint: str(r.hint, 300) }),
    };
  }
  return out;
}

/** One guardian question of an event's form: the fixed phone / relationship and every own field. */
export type GuardianQuestion = {
  key: string; // "phone" | "relationship" | own key
  fixed: boolean;
  name: string; // the field's name (organization)
  label: string; // the wording in this form (own wording or the name)
  ownLabel: boolean; // the wording was set for this form
  hint: string | null;
  fieldType: string;
  options: string[] | null;
  ask: boolean;
  required: boolean;
  requiredDefault: boolean; // the organization's default
};

/** The guardian questions of a form (event = null: the organization defaults, e.g. the portal profile). */
export function guardianQuestions(settings: GuardianSettings, form: GuardianForm | null, names: { phone: string; relationship: string }): GuardianQuestion[] {
  const q = (key: string, fixed: boolean, name: string, fieldType: string, options: string[] | null, requiredDefault: boolean): GuardianQuestion => {
    const c = form?.[key] ?? {};
    return { key, fixed, name, label: c.label || name, ownLabel: !!c.label, hint: c.hint ?? null, fieldType, options, ask: fixed ? true : (c.ask ?? true), required: c.required ?? requiredDefault, requiredDefault };
  };
  return [
    q("phone", true, names.phone, "phone", null, settings.fixedRequired.phone),
    q("relationship", true, names.relationship, "text", null, settings.fixedRequired.relationship),
    ...settings.fields.map((f) => q(f.key, false, f.label, f.fieldType, f.options, f.required)),
  ];
}

/** A guardian's own-field values from a request: only known keys, cleaned by type. Null = an invalid value. */
export function cleanGuardianExtra(fields: GuardianFieldDef[], raw: unknown): Record<string, string> | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = cleanFieldValue(f, o[f.key]);
    if (v === null) return null;
    if (v) out[f.key] = v;
  }
  return out;
}

/** Stored extra (JSON) -> string values. */
export function guardianExtra(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([, v]) => typeof v === "string" && v !== "")) as Record<string, string>;
}

/** Missing required answers of one guardian (asked questions only): the keys. */
export function missingGuardianAnswers(questions: GuardianQuestion[], g: { phone?: string | null; relationship?: string | null; extra?: Record<string, string> | null }): string[] {
  return questions
    .filter((q) => q.ask && q.required)
    .filter((q) => {
      const v = (q.key === "phone" ? g.phone : q.key === "relationship" ? g.relationship : g.extra?.[q.key])?.toString().trim() ?? "";
      // A required consent must be given, not just answered.
      return q.fieldType === "consent" ? v !== "true" : !v;
    })
    .map((q) => q.key);
}
