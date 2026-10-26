export type ParticipantFieldType = "text" | "number" | "date" | "boolean" | "select" | "image" | "composite";

// "Složené pole": other fields' values joined by a separator (empty ones skipped).
// template (2026-10-27): text with {{key}} values of the event's fields, {{#key}}…{{/key}} only when that
// field says something (not empty, not Ne/false/0) and {{^key}}…{{/key}} only when it doesn't -- e.g.
// "{{#clenstvi_rok}}Člen Záře, nižší cena {{price}}{{/clenstvi_rok}}{{^clenstvi_rok}}Nečlen, cena {{price}}{{/clenstvi_rok}}".
// Set = used instead of the parts.
export type CompositeConfig = { parts: string[]; separator: string; template?: string };
export const COMPOSITE_TEMPLATE_MAX = 2000;

export function readComposite(options: unknown): CompositeConfig {
  const o = options && typeof options === "object" && !Array.isArray(options) ? (options as { parts?: unknown; separator?: unknown; template?: unknown }) : {};
  return {
    parts: Array.isArray(o.parts) ? o.parts.filter((k): k is string => typeof k === "string") : [],
    separator: typeof o.separator === "string" ? o.separator : " ",
    ...(typeof o.template === "string" && o.template.trim() && { template: o.template.slice(0, COMPOSITE_TEMPLATE_MAX) }),
  };
}

/** Whether a value "says something" for {{#key}}: not empty and not a no. */
const truthy = (v: string | undefined) => !!v?.trim() && !["ne", "false", "0", "no"].includes(v.trim().toLowerCase());

/** The template filled in: blocks first ({{#k}}…{{/k}} / {{^k}}…{{/k}}, not nested), then {{k}} values. */
export function renderCompositeTemplate(template: string, valueOf: (key: string) => string | undefined): string {
  const blocks = template.replace(/\{\{([#^])([A-Za-z0-9_]+)\}\}([\s\S]*?)\{\{\/\2\}\}/g, (_m, sign: string, key: string, inner: string) => (truthy(valueOf(key)) === (sign === "#") ? inner : ""));
  return blocks.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_m, key: string) => (valueOf(key) ?? "").trim()).trim();
}

/** Untrusted composite options -> parts limited to `partKeys` (no self, no repeats), short separator. */
export function sanitizeComposite(options: unknown, partKeys: Set<string>, selfKey: string): CompositeConfig {
  const cfg = readComposite(options);
  return {
    parts: [...new Set(cfg.parts)].filter((k) => k !== selfKey && partKeys.has(k)).slice(0, 20),
    separator: cfg.separator.slice(0, 20),
    ...(cfg.template && { template: cfg.template }),
  };
}

export function composeValue(cfg: CompositeConfig, valueOf: (key: string) => string | undefined): string {
  if (cfg.template) return renderCompositeTemplate(cfg.template, valueOf);
  return cfg.parts
    .map((k) => (valueOf(k) ?? "").trim())
    .filter(Boolean)
    .join(cfg.separator);
}
export type ParticipantFieldSurface = "list" | "health_list" | "health_detail" | "mail_list" | "documents" | "email" | "import";
export type ParticipantFieldKind = "custom" | "builtin" | "guardian" | "computed";

export type ParticipantFieldDef = {
  id: string;
  key: string;
  label: string;
  fieldType: ParticipantFieldType;
  options: string[] | null;
  surfaces: ParticipantFieldSurface[];
  kind: ParticipantFieldKind;
};

// "Ano"/"Ne" hardcoded rather than translated -- matches the existing
// convention for boolean display elsewhere in this app (src/lib/drive-export.ts).
export function formatFieldValue(value: string | undefined, fieldType: ParticipantFieldType, options?: unknown): string {
  if (value === undefined || value === "") return "—";
  if (fieldType === "boolean") {
    const b = toBoolean(value, options);
    return b === "true" ? "Ano" : b === "false" ? "Ne" : `${value} (?)`;
  }
  return value;
}

// Ano/Ne fields: which stored/imported values mean Ano and which Ne. Per field
// (options of a boolean field = { trueValues, falseValues }, lower-cased) on
// top of these defaults; the field's own lists win over the defaults.
export type BooleanMapping = { trueValues: string[]; falseValues: string[] };
export const DEFAULT_TRUE_VALUES = ["true", "ano", "a", "yes", "y", "1", "x"];
export const DEFAULT_FALSE_VALUES = ["false", "ne", "n", "no", "0"];
export const normalizeBooleanValue = (v: string) => v.trim().toLowerCase();

export function readBooleanMapping(options: unknown): BooleanMapping {
  const o = options && typeof options === "object" && !Array.isArray(options) ? (options as { trueValues?: unknown; falseValues?: unknown }) : {};
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map(normalizeBooleanValue) : []);
  return { trueValues: list(o.trueValues), falseValues: list(o.falseValues) };
}

/** "true" / "false" as the app stores it, or null when the value means neither. */
export function toBoolean(raw: string | undefined | null, options?: unknown): "true" | "false" | null {
  const v = normalizeBooleanValue(raw ?? "");
  if (!v) return null;
  const m = readBooleanMapping(options);
  if (m.trueValues.includes(v)) return "true";
  if (m.falseValues.includes(v)) return "false";
  if (DEFAULT_TRUE_VALUES.includes(v)) return "true";
  if (DEFAULT_FALSE_VALUES.includes(v)) return "false";
  return null;
}

// Participants/settings/Health/Mail prompt, Part 4: the field-admin screen no longer
// exposes the raw surface checkboxes -- a field has one derived category, plus a single
// "show in the central roster" toggle. Category is derived from (not stored alongside)
// surfaces/kind, and turned back into a concrete surfaces array on save -- the schema
// enum is unchanged, this is purely an admin-UI simplification.
export type ParticipantFieldCategory = "basic" | "health" | "mail" | "custom";

export function fieldCategory(kind: ParticipantFieldKind, surfaces: ParticipantFieldSurface[]): ParticipantFieldCategory {
  // Only a custom field is freely categorizable -- builtin/guardian/computed rows are all
  // fixed, non-deletable, pre-defined fields (the row's own kind badge already says which);
  // "Základní" covers all three uniformly as this category's catch-all for "not custom".
  if (kind !== "custom") return "basic";
  if (surfaces.includes("health_list") || surfaces.includes("health_detail")) return "health";
  if (surfaces.includes("mail_list")) return "mail";
  return "custom";
}

/** The full surfaces set implied by a category -- documents/import always on, `list` only if asked. */
export function surfacesForCategory(category: ParticipantFieldCategory, showInList: boolean): ParticipantFieldSurface[] {
  const surfaces: ParticipantFieldSurface[] = ["documents", "email", "import"];
  if (showInList) surfaces.push("list");
  if (category === "health") surfaces.push("health_list", "health_detail");
  if (category === "mail") surfaces.push("mail_list");
  return surfaces;
}
