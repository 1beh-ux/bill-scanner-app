// Basic vs. detailed profile data and per-event required fields
// (docs/registration-slice5-spec.md) -- pure, no DB, no Node-only imports:
// the portal, the public form, the admin roster and the self-check
// (scripts/test-registration-slice5.ts) share it.

export type FieldAudience = "both" | "children" | "adults";
export type FieldLevel = "basic" | "detailed";
export const FIELD_AUDIENCES: FieldAudience[] = ["both", "children", "adults"];
export const FIELD_LEVELS: FieldLevel[] = ["basic", "detailed"];

/** Whether a field is for this person. Unknown (null: a participant not linked to a person) = only fields for both. */
export const appliesTo = (audience: FieldAudience | undefined, isAdult: boolean | null) =>
  !audience || audience === "both" || (isAdult != null && audience === (isAdult ? "adults" : "children"));
