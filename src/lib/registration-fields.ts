// Basic vs. detailed profile data and per-event required fields
// (docs/registration-slice5-spec.md) -- pure, no DB, no Node-only imports:
// the portal, the public form, the admin roster and the self-check
// (scripts/test-registration-slice5.ts) share it.
import { isIsoDate, type PortalAccessLevel } from "@/lib/portal-rules";

export type FieldAudience = "both" | "children" | "adults";
export type FieldLevel = "basic" | "detailed";
export const FIELD_AUDIENCES: FieldAudience[] = ["both", "children", "adults"];
export const FIELD_LEVELS: FieldLevel[] = ["basic", "detailed"];

/** Whether a field is for this person. Unknown (null: a participant not linked to a person) = only fields for both. */
export const appliesTo = (audience: FieldAudience | undefined, isAdult: boolean | null) =>
  !audience || audience === "both" || (isAdult != null && audience === (isAdult ? "adults" : "children"));

/**
 * A select's options for one person (2026-10-22): adults get the field's own adult list when it has one
 * (Žena / Muž instead of Dívka / Chlapec). isAdult unknown (admin screens, event copies) = both lists.
 */
export function optionsFor(f: { options: unknown; adultOptions?: unknown }, isAdult?: boolean | null): unknown {
  const list = (o: unknown) => (Array.isArray(o) ? o.filter((x): x is string => typeof x === "string") : []);
  const adult = list(f.adultOptions);
  if (!adult.length) return f.options;
  if (isAdult === true) return adult;
  if (isAdult === false) return f.options;
  return [...new Set([...list(f.options), ...adult])];
}

// --- Asked at registration (spec 2-3) --------------------------------------

export type TemplateRule = { key: string; label: string; fieldType: string; options: unknown; adultOptions?: unknown; portalAccess: PortalAccessLevel; audience: FieldAudience; level: FieldLevel };
export type EventFieldRule = { key: string; label: string; fieldType: string; options: unknown; kind: string; requiredOnRegistration: boolean };

/**
 * One field the registration step asks: a profile field (the event's field has
 * an active org template -- answer goes to the profile by its portal rule) or
 * an event question (event-only field -- answer stays on the participant).
 */
export type AskedField = {
  key: string;
  label: string;
  fieldType: string;
  options: unknown;
  source: "profile" | "event";
  access: "edit" | "approval" | null;
  level: FieldLevel;
  audience: FieldAudience;
};

/**
 * What an event asks of one person when registering: its custom fields marked
 * "Vyžadovat při přihlášce". A template field only while parents may edit it
 * (edit / approval) and only for its audience; an event-only field is asked of
 * everyone. `isAdult` undefined = don't filter by audience (the public form
 * filters per person itself). Profile fields in the parents' order (the templates map's
 * order, Šablony -> Účastníci -> Pořadí polí), then the event's own questions in event order.
 */
export function askedFields(eventFields: EventFieldRule[], templates: Map<string, TemplateRule>, isAdult?: boolean | null): AskedField[] {
  const out: AskedField[] = [];
  for (const f of eventFields) {
    if (f.kind !== "custom" || !f.requiredOnRegistration) continue;
    const t = templates.get(f.key);
    if (!t) {
      out.push({ key: f.key, label: f.label, fieldType: f.fieldType, options: f.options, source: "event", access: null, level: "basic", audience: "both" });
      continue;
    }
    if (t.portalAccess !== "edit" && t.portalAccess !== "approval") continue;
    if (isAdult !== undefined && !appliesTo(t.audience, isAdult)) continue;
    out.push({ key: t.key, label: t.label, fieldType: t.fieldType, options: optionsFor(t, isAdult), source: "profile", access: t.portalAccess, level: t.level, audience: t.audience });
  }
  const rank = new Map([...templates.keys()].map((k, i) => [k, i]));
  const at = (f: AskedField) => (f.source === "event" ? Number.MAX_SAFE_INTEGER : (rank.get(f.key) ?? Number.MAX_SAFE_INTEGER));
  // Array.sort is stable: event questions keep their event order after the profile fields.
  return out.sort((a, b) => at(a) - at(b));
}

/**
 * Two-step registration (2026-10-23, Event.detailsAfterAcceptance): registering asks only the basic
 * profile fields; the detailed ones and the event's own questions are filled after acceptance (portal
 * registration card, or the participant's own link). Off = everything at once, as before.
 */
export const isBasicAsk = (f: AskedField) => f.source === "profile" && f.level === "basic";
export const askedNow = (asked: AskedField[], later: boolean) => (later ? asked.filter(isBasicAsk) : asked);
export const askedLater = (asked: AskedField[], later: boolean) => (later ? asked.filter((f) => !isBasicAsk(f)) : []);

const selectOptions = (options: unknown) => (Array.isArray(options) ? options.filter((o): o is string => typeof o === "string") : []);

/** One submitted value by the field's type: "" = empty, null = invalid (unknown select option, bad date). */
export function cleanFieldValue(f: { fieldType: string; options: unknown }, raw: unknown): string | null {
  const value = typeof raw === "string" ? raw.trim().slice(0, 2000) : "";
  if (!value) return "";
  if (f.fieldType === "select" && selectOptions(f.options).length && !selectOptions(f.options).includes(value)) return null;
  if (f.fieldType === "date" && !isIsoDate(value)) return null;
  if (f.fieldType === "boolean") return value === "true" ? "true" : "false";
  return value;
}

/** The "Údaje jsou aktuální" tick: some shown detailed profile field came pre-filled. */
export const needsReviewTick = (asked: AskedField[], prefill: Record<string, string>) => asked.some((f) => f.source === "profile" && f.level === "detailed" && !!prefill[f.key]?.trim());

/**
 * One person's answers -> clean values (every asked key) or error codes (the
 * empty/invalid keys, "reviewed" when the tick is needed and missing). An
 * unticked Ano/Ne box is an answer ("false").
 */
export function checkAnswers(
  asked: AskedField[],
  raw: unknown,
  opts: { prefill: Record<string, string>; reviewed: boolean }
): { ok: true; values: Record<string, string> } | { ok: false; errors: string[] } {
  const answers = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const values: Record<string, string> = {};
  const errors: string[] = [];
  for (const f of asked) {
    const v = f.fieldType === "boolean" && !answers[f.key] ? "false" : cleanFieldValue(f, answers[f.key]);
    if (!v) errors.push(f.key);
    else values[f.key] = v;
  }
  if (needsReviewTick(asked, opts.prefill) && !opts.reviewed) errors.push("reviewed");
  return errors.length ? { ok: false, errors } : { ok: true, values };
}

/**
 * Where checked answers go: all onto the participant (they are the
 * registration's answers); profile fields also to the profile -- `edit`
 * applied when different from the live value, `approval` a pending change when
 * different from what the parent was shown (live, or their pending proposal);
 * event questions nowhere else.
 */
export function routeAnswers(
  asked: AskedField[],
  values: Record<string, string>,
  live: Record<string, string>,
  shown: Record<string, string>
): { participant: Record<string, string>; profile: Record<string, string>; proposals: { key: string; oldValue: string; newValue: string }[] } {
  const out = { participant: { ...values }, profile: {} as Record<string, string>, proposals: [] as { key: string; oldValue: string; newValue: string }[] };
  for (const f of asked) {
    const v = values[f.key];
    if (v === undefined || f.source !== "profile") continue;
    if (f.access === "edit" && v !== (live[f.key] ?? "")) out.profile[f.key] = v;
    if (f.access === "approval" && v !== (shown[f.key] ?? live[f.key] ?? "")) out.proposals.push({ key: f.key, oldValue: live[f.key] ?? "", newValue: v });
  }
  return out;
}

/**
 * Status "missing" (spec 5): an asked field is empty -- profile fields on the
 * person's profile (no linked person: the participant's own values), event
 * questions on the participant.
 */
export const askedMissing = (asked: AskedField[], profile: Record<string, string> | null, participant: Record<string, string | undefined>) =>
  asked.some((f) => !(f.source === "profile" && profile ? profile[f.key] : participant[f.key])?.trim());
