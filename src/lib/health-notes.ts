// Zdravotní poznámky -- which participant fields are the important health notes,
// in what order, and where each one shows (Nastavení akce -> Zdraví). Stored as
// Event.healthNotes; null = never configured -> defaultHealthNotes() (what the
// app showed before this setting existed). Prisma-free: the settings UI uses it.

export type HealthNotePlace = "detail" | "meds" | "incident" | "pdf" | "list";
export const HEALTH_NOTE_PLACES: HealthNotePlace[] = ["detail", "meds", "incident", "pdf", "list"];
export type HealthNoteConfig = { fieldKey: string; places: HealthNotePlace[]; highlight: boolean };
// A note as a place shows it (only non-empty ones).
export type HealthNote = { key: string; label: string; value: string; highlight: boolean; places: HealthNotePlace[] };

// The parent summary PDF used to print exactly these four.
const OLD_PDF_KEYS = ["allergies", "medsNotes", "chronicIssues", "otherNotes"];

type FieldLike = { key: string; kind: string; active?: boolean; surfaces: string[] };

/** The setup before this setting existed: Zdraví fields on the detail/meds/incident screens, the 4 PDF fields in the PDF. */
export function defaultHealthNotes(fields: FieldLike[]): HealthNoteConfig[] {
  const out: HealthNoteConfig[] = [];
  for (const f of fields) {
    if (f.active === false) continue;
    const onScreens = f.surfaces.includes("health_detail");
    const inPdf = OLD_PDF_KEYS.includes(f.key);
    if (!onScreens && !inPdf) continue;
    out.push({
      fieldKey: f.key,
      places: [...(onScreens ? (["detail", "meds", "incident"] as HealthNotePlace[]) : []), ...(inPdf ? (["pdf"] as HealthNotePlace[]) : [])],
      highlight: false,
    });
  }
  return out;
}

/** Untrusted config -> valid one: known fields only, no repeats, known places. */
export function sanitizeHealthNotes(input: unknown, fieldKeys: Set<string>): HealthNoteConfig[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: HealthNoteConfig[] = [];
  for (const raw of input.slice(0, 100)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as { fieldKey?: unknown; places?: unknown; highlight?: unknown };
    if (typeof r.fieldKey !== "string" || !fieldKeys.has(r.fieldKey) || seen.has(r.fieldKey)) continue;
    seen.add(r.fieldKey);
    const places = Array.isArray(r.places) ? HEALTH_NOTE_PLACES.filter((p) => (r.places as unknown[]).includes(p)) : [];
    out.push({ fieldKey: r.fieldKey, places, highlight: r.highlight === true });
  }
  return out;
}

/** The notes for one place, in the configured order, from already-resolved field values. */
export function notesFor(
  config: HealthNoteConfig[],
  place: HealthNotePlace | "all",
  values: Record<string, string>,
  labels: Record<string, string>
): HealthNote[] {
  return config
    .filter((c) => place === "all" || c.places.includes(place))
    .map((c) => ({ key: c.fieldKey, label: labels[c.fieldKey] ?? c.fieldKey, value: (values[c.fieldKey] ?? "").trim(), highlight: c.highlight, places: c.places }))
    .filter((n) => n.value);
}

/** {{health_notes}}: "Label: value" lines. */
export const healthNotesText = (notes: HealthNote[]) => notes.map((n) => `${n.label}: ${n.value}`).join("\n");
