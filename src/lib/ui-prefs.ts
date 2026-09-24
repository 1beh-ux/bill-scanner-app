// Per-user UI preferences (User.uiPrefs), saved through PATCH /api/me so they
// follow the person across devices. Every key is optional; readers fall back
// to the defaults below. (Card display and export design are per event now --
// Event.planningSettings; old keys left in stored JSON are simply ignored.)
export type UiPrefs = {
  planningLibraryWidth?: number; // px, the planning board's library panel
};

export const UI_PREF_DEFAULTS: Required<UiPrefs> = { planningLibraryWidth: 240 };
const NUMBER_LIMITS: Record<keyof UiPrefs, [number, number]> = { planningLibraryWidth: [180, 640] };

/** Keeps only known keys with in-range numbers -- the PATCH body is untrusted. */
export function sanitizeUiPrefs(input: unknown): UiPrefs {
  const out: UiPrefs = {};
  if (!input || typeof input !== "object") return out;
  const src = input as Record<string, unknown>;
  for (const [key, [min, max]] of Object.entries(NUMBER_LIMITS) as [keyof UiPrefs, [number, number]][]) {
    const v = src[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = Math.round(Math.min(max, Math.max(min, v)));
  }
  return out;
}
