// Pole -> Formulář (rethink 2026-11-24): every question of an event's registration form has its own settings, in
// EventParticipantField.formConfig -- independent of the parent portal:
//   ask        the form asks it (else it isn't on the form)
//   required   the applicant must answer
//   audience   for whom: children / adults / both
//   when       "registration" (on the form) or "after" (two-step event: after acceptance, in the portal)
//   label      the question's own wording (default: the field's name); hint = a line under it
// formConfig null = today's rules (asked = a basic portal field, or "Vyžadovat při přihlášce" which also makes it
// required). The first change on the Formulář screen converts the whole event: every field gets the settings that
// reproduce exactly what the form asked before, then the change is applied. Pure.
export type Audience = "children" | "adults" | "both";
export type FormConfig = { ask: boolean; required: boolean; audience: Audience | null; when: "registration" | "after"; label: string | null; hint: string | null };

const AUD = ["children", "adults", "both"];
export function readFormConfig(v: unknown): FormConfig | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const text = (x: unknown, max: number) => (typeof x === "string" && x.trim() ? x.trim().slice(0, max) : null);
  return {
    ask: o.ask === true,
    required: o.required === true,
    audience: AUD.includes(o.audience as string) ? (o.audience as Audience) : null,
    when: o.when === "after" ? "after" : "registration",
    label: text(o.label, 300),
    hint: text(o.hint, 500),
  };
}

type FieldLike = { kind: string; active: boolean; requiredOnRegistration: boolean };
type TemplateLike = { portalAccess: string; level: string; audience: string; requiredInRegistration: boolean } | null | undefined;

/**
 * Today's rules as settings (what the form asks now): an organization field when it is in the portal and either at
 * the basic level or marked "Vyžadovat" (by parents who may edit it); an event question when marked. Pure.
 */
export function legacyFormConfig(f: FieldLike, t: TemplateLike, detailsAfterAcceptance: boolean): FormConfig {
  const off: FormConfig = { ask: false, required: false, audience: null, when: "registration", label: null, hint: null };
  if (f.kind !== "custom" || !f.active) return off;
  if (!t) return { ...off, ask: f.requiredOnRegistration, required: f.requiredOnRegistration, when: f.requiredOnRegistration && detailsAfterAcceptance ? "after" : "registration" };
  const editable = t.portalAccess === "edit" || t.portalAccess === "approval";
  const inPortal = t.portalAccess !== "hidden";
  const viaFlag = f.requiredOnRegistration && editable;
  const ask = inPortal && (t.level === "basic" || viaFlag);
  return {
    ...off,
    ask,
    required: ask && (t.requiredInRegistration || viaFlag),
    audience: (AUD.includes(t.audience) ? t.audience : "both") as Audience,
    when: ask && t.level !== "basic" && detailsAfterAcceptance ? "after" : "registration",
  };
}

/** The settings in force: the saved ones, or today's rules. Pure. */
export const effectiveFormConfig = (f: FieldLike & { formConfig?: unknown }, t: TemplateLike, detailsAfterAcceptance: boolean) =>
  readFormConfig(f.formConfig) ?? legacyFormConfig(f, t, detailsAfterAcceptance);

/** A change from the screen applied to settings (only the given keys). Pure. */
export function applyFormChange(c: FormConfig, change: Record<string, unknown>): FormConfig {
  const next = { ...c };
  if (typeof change.ask === "boolean") next.ask = change.ask;
  if (typeof change.required === "boolean") next.required = change.required;
  if (change.audience === null || AUD.includes(change.audience as string)) next.audience = change.audience as Audience | null;
  if (change.when === "registration" || change.when === "after") next.when = change.when;
  if (change.label !== undefined) next.label = typeof change.label === "string" && change.label.trim() ? change.label.trim().slice(0, 300) : null;
  if (change.hint !== undefined) next.hint = typeof change.hint === "string" && change.hint.trim() ? change.hint.trim().slice(0, 500) : null;
  if (!next.ask) next.required = false;
  return next;
}
