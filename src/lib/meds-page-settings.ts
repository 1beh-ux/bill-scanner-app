// Léky a výdej settings (2026-10-27, Nastavení akce -> Zdraví): how big the table is, which date buttons
// it offers and which one it opens on, and the print defaults. Pure, client-safe.
export type MedsPreset = "today" | "week" | "event" | "custom";
export const MEDS_PRESETS: MedsPreset[] = ["today", "week", "event", "custom"];
export type MedsFontSize = "s" | "m" | "l" | "xl";
export const MEDS_FONT_SIZES: MedsFontSize[] = ["s", "m", "l", "xl"];
// The table scales as a whole (text, ticks, column widths) -- CSS zoom.
export const MEDS_ZOOM: Record<MedsFontSize, number> = { s: 0.85, m: 1, l: 1.2, xl: 1.45 };

export type MedsPageSettings = {
  fontSize: MedsFontSize;
  presets: MedsPreset[];
  defaultPreset: MedsPreset;
  exportMode: "blank" | "hybrid";
  exportFormat: "A4" | "A3";
};

export function readMedsPageSettings(raw: unknown): MedsPageSettings {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const presets = Array.isArray(o.presets) ? MEDS_PRESETS.filter((p) => (o.presets as unknown[]).includes(p)) : MEDS_PRESETS;
  const shown = presets.length ? presets : MEDS_PRESETS;
  const def = MEDS_PRESETS.includes(o.defaultPreset as MedsPreset) && shown.includes(o.defaultPreset as MedsPreset) ? (o.defaultPreset as MedsPreset) : shown[0];
  return {
    fontSize: MEDS_FONT_SIZES.includes(o.fontSize as MedsFontSize) ? (o.fontSize as MedsFontSize) : "m",
    presets: shown,
    defaultPreset: def,
    exportMode: o.exportMode === "hybrid" ? "hybrid" : "blank",
    exportFormat: o.exportFormat === "A3" ? "A3" : "A4",
  };
}
