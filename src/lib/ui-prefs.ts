// Per-user UI preferences (User.uiPrefs), saved through PATCH /api/me so they
// follow the person across devices. Every key is optional; readers fall back
// to the defaults below. (Card display and export design are per event now --
// Event.planningSettings; old keys left in stored JSON are simply ignored.)
export type UiPrefs = {
  planningLibraryWidth?: number; // px, the planning board's library panel
  planningLibraryHidden?: boolean; // library collapsed to a narrow strip
  menuFavorites?: string[]; // MENU_ITEMS ids pinned to the top of the sidebar
  billNotesHeight?: number; // px, the bill detail's note field as the user resized it (0 = default 4 rows)
  bankColumns?: Record<string, string[]>; // Banka -> Pohyby: shown columns per event id ("Sloupce")
};

export const UI_PREF_DEFAULTS: Required<UiPrefs> = { planningLibraryWidth: 240, planningLibraryHidden: false, menuFavorites: [], billNotesHeight: 0, bankColumns: {} };
const NUMBER_LIMITS: Partial<Record<keyof UiPrefs, [number, number]>> = { planningLibraryWidth: [180, 640], billNotesHeight: [40, 1200] };

/** Keeps only known keys with in-range numbers -- the PATCH body is untrusted. */
export function sanitizeUiPrefs(input: unknown): UiPrefs {
  const out: UiPrefs = {};
  if (!input || typeof input !== "object") return out;
  const src = input as Record<string, unknown>;
  for (const [key, [min, max]] of Object.entries(NUMBER_LIMITS) as ["planningLibraryWidth" | "billNotesHeight", [number, number]][]) {
    const v = src[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = Math.round(Math.min(max, Math.max(min, v)));
  }
  if (typeof src.planningLibraryHidden === "boolean") out.planningLibraryHidden = src.planningLibraryHidden;
  if (Array.isArray(src.menuFavorites)) {
    out.menuFavorites = src.menuFavorites.filter((x): x is string => typeof x === "string" && x.length <= 60).slice(0, 40);
  }
  if (src.bankColumns && typeof src.bankColumns === "object" && !Array.isArray(src.bankColumns)) {
    out.bankColumns = Object.fromEntries(
      Object.entries(src.bankColumns as Record<string, unknown>)
        .filter(([k, v]) => /^[\w-]{1,64}$/.test(k) && Array.isArray(v))
        .slice(0, 50)
        .map(([k, v]) => [k, (v as unknown[]).filter((x): x is string => typeof x === "string" && x.length <= 30).slice(0, 20)])
    );
  }
  return out;
}
