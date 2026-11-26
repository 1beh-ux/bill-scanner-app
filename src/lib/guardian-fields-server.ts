// Guardian fields (2026-11-26, src/lib/guardian-fields.ts): the organization's own guardian fields and each event's
// form settings of the guardian questions. Server only.
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { invalidateResolverContext } from "@/lib/field-resolver";
import { FIXED_GUARDIAN_KEYS, GUARDIAN_FIELD_TYPES, GUARDIAN_KEY, readGuardianForm, readGuardianSettings, type GuardianFieldType, type GuardianSettings } from "@/lib/guardian-fields";

export async function guardianSettings(organizationId: string): Promise<GuardianSettings> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { guardianProps: true } });
  return readGuardianSettings(org.guardianProps);
}

const saveSettings = async (organizationId: string, s: GuardianSettings) => {
  await prisma.organization.update({ where: { id: organizationId }, data: { guardianProps: s as unknown as Prisma.InputJsonValue } });
  invalidateResolverContext();
};

const cleanOptions = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))].slice(0, 100) : []);

/** A new guardian field of the organization. Errors: invalid_key, key_taken, invalid_type, options_required. */
export async function createGuardianField(organizationId: string, input: { key: unknown; label: unknown; fieldType: unknown; options?: unknown; required?: unknown }) {
  const key = typeof input.key === "string" ? input.key.trim() : "";
  const label = typeof input.label === "string" ? input.label.trim().slice(0, 200) : "";
  if (!GUARDIAN_KEY.test(key)) throw new Error("invalid_key");
  if (!label) throw new Error("invalid");
  if (!(GUARDIAN_FIELD_TYPES as readonly unknown[]).includes(input.fieldType)) throw new Error("invalid_type");
  const s = await guardianSettings(organizationId);
  if (FIXED_GUARDIAN_KEYS.includes(key) || s.fields.some((f) => f.key === key)) throw new Error("key_taken");
  const fieldType = input.fieldType as GuardianFieldType;
  const options = fieldType === "select" || fieldType === "multi" ? cleanOptions(input.options) : null;
  if (options && !options.length) throw new Error("options_required");
  s.fields.push({ key, label, fieldType, options, required: input.required === true });
  await saveSettings(organizationId, s);
  return key;
}

/** Name, type, options of an own guardian field (organization-wide). */
export async function updateGuardianField(organizationId: string, key: string, change: { label?: unknown; fieldType?: unknown; options?: unknown }) {
  const s = await guardianSettings(organizationId);
  const f = s.fields.find((x) => x.key === key);
  if (!f) throw new Error("not_found");
  if (typeof change.label === "string" && change.label.trim()) f.label = change.label.trim().slice(0, 200);
  if (change.fieldType !== undefined) {
    if (!(GUARDIAN_FIELD_TYPES as readonly unknown[]).includes(change.fieldType)) throw new Error("invalid_type");
    f.fieldType = change.fieldType as GuardianFieldType;
  }
  if (f.fieldType === "select" || f.fieldType === "multi") {
    const options = change.options !== undefined ? cleanOptions(change.options) : (f.options ?? []);
    if (!options.length) throw new Error("options_required");
    f.options = options;
  } else f.options = null;
  await saveSettings(organizationId, s);
}

/** Removes an own guardian field from the organization (the values already stored on guardians stay). */
export async function deleteGuardianField(organizationId: string, key: string) {
  const s = await guardianSettings(organizationId);
  s.fields = s.fields.filter((f) => f.key !== key);
  await saveSettings(organizationId, s);
}

/**
 * "Výchozí pro organizaci" of a guardian question (phone, relationship or an own field). Events that didn't set it
 * by hand follow it (their form stores "required" only when it differs from the organization).
 */
export async function setGuardianRequiredDefault(organizationId: string, key: string, value: boolean) {
  const s = await guardianSettings(organizationId);
  if (key === "phone" || key === "relationship") s.fixedRequired[key] = value;
  else {
    const f = s.fields.find((x) => x.key === key);
    if (!f) throw new Error("not_found");
    f.required = value;
  }
  await saveSettings(organizationId, s);
}

/** One guardian question of an event's form: ask (own fields only), required, wording, hint. */
export async function changeGuardianQuestion(eventId: string, key: string, change: Record<string, unknown>) {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { organizationId: true, guardianForm: true } });
  const s = await guardianSettings(event.organizationId);
  const fixed = key === "phone" || key === "relationship";
  const def = fixed ? s.fixedRequired[key as "phone" | "relationship"] : s.fields.find((f) => f.key === key)?.required;
  if (def === undefined) throw new Error("not_found");
  const form = readGuardianForm(event.guardianForm);
  const c = { ...(form[key] ?? {}) };
  if (typeof change.ask === "boolean" && !fixed) c.ask = change.ask;
  // Stored only when it differs from the organization -- so a later change of the default reaches this event.
  if (typeof change.required === "boolean") {
    if (change.required === def) delete c.required;
    else c.required = change.required;
  }
  if (change.resetRequired === true) delete c.required;
  if (change.label !== undefined) {
    if (typeof change.label === "string" && change.label.trim()) c.label = change.label.trim().slice(0, 200);
    else delete c.label;
  }
  if (change.hint !== undefined) {
    if (typeof change.hint === "string" && change.hint.trim()) c.hint = change.hint.trim().slice(0, 300);
    else delete c.hint;
  }
  form[key] = c;
  await prisma.event.update({ where: { id: eventId }, data: { guardianForm: form as Prisma.InputJsonValue } });
}
