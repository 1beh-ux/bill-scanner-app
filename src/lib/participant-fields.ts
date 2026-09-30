export type ParticipantFieldType = "text" | "number" | "date" | "boolean" | "select" | "image" | "composite";

// "Složené pole": other fields' values joined by a separator (empty ones skipped).
export type CompositeConfig = { parts: string[]; separator: string };

export function readComposite(options: unknown): CompositeConfig {
  const o = options && typeof options === "object" && !Array.isArray(options) ? (options as { parts?: unknown; separator?: unknown }) : {};
  return {
    parts: Array.isArray(o.parts) ? o.parts.filter((k): k is string => typeof k === "string") : [],
    separator: typeof o.separator === "string" ? o.separator : " ",
  };
}

/** Untrusted composite options -> parts limited to `partKeys` (no self, no repeats), short separator. */
export function sanitizeComposite(options: unknown, partKeys: Set<string>, selfKey: string): CompositeConfig {
  const cfg = readComposite(options);
  return {
    parts: [...new Set(cfg.parts)].filter((k) => k !== selfKey && partKeys.has(k)).slice(0, 20),
    separator: cfg.separator.slice(0, 20),
  };
}

export function composeValue(cfg: CompositeConfig, valueOf: (key: string) => string | undefined): string {
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
export function formatFieldValue(value: string | undefined, fieldType: ParticipantFieldType): string {
  if (value === undefined || value === "") return "—";
  if (fieldType === "boolean") return value === "true" ? "Ano" : "Ne";
  return value;
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
