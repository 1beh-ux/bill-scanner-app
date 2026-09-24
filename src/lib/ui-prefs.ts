// Per-user UI preferences (User.uiPrefs), saved through PATCH /api/me so they
// follow the person across devices. Every key is optional; readers fall back
// to the defaults below.
export type UiPrefs = {
  planningLibraryWidth?: number; // px, the planning board's library panel
  // What activity cards on the planning board show besides the (always full) name.
  planningCardShowDescription?: boolean;
  planningCardDescriptionChars?: number;
  planningCardShowMeta?: boolean; // leader · location
  planningCardShowGroups?: boolean;
};

export const UI_PREF_DEFAULTS: Required<UiPrefs> = {
  planningLibraryWidth: 240,
  planningCardShowDescription: true,
  planningCardDescriptionChars: 120,
  planningCardShowMeta: true,
  planningCardShowGroups: true,
};
const NUMBER_LIMITS: Partial<Record<keyof UiPrefs, [number, number]>> = {
  planningLibraryWidth: [180, 640],
  planningCardDescriptionChars: [10, 1000],
};
const BOOLEAN_KEYS: (keyof UiPrefs)[] = ["planningCardShowDescription", "planningCardShowMeta", "planningCardShowGroups"];

/** Keeps only known keys with valid values (numbers clamped) -- the PATCH body is untrusted. */
export function sanitizeUiPrefs(input: unknown): UiPrefs {
  const out: Record<string, number | boolean> = {};
  if (!input || typeof input !== "object") return out;
  const src = input as Record<string, unknown>;
  for (const [key, [min, max]] of Object.entries(NUMBER_LIMITS) as [string, [number, number]][]) {
    const v = src[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = Math.round(Math.min(max, Math.max(min, v)));
  }
  for (const key of BOOLEAN_KEYS) if (typeof src[key] === "boolean") out[key] = src[key] as boolean;
  return out as UiPrefs;
}
