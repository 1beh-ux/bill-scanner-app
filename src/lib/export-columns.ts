// The participant export's columns (2026-10-27): field keys in order -- the event's own, else the
// organization's default, else (null) every field the user may see. Pure.
export function readExportColumns(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const keys = [...new Set(raw.filter((k): k is string => typeof k === "string" && /^[A-Za-z0-9_]{1,64}$/.test(k)))].slice(0, 200);
  return keys.length ? keys : null;
}

/** The fields to export, in order: the saved keys that exist (and may be seen), else all of them. */
export function exportFields<F extends { key: string }>(fields: F[], saved: string[] | null): F[] {
  if (!saved) return fields;
  const byKey = new Map(fields.map((f) => [f.key, f]));
  return saved.map((k) => byKey.get(k)).filter((f): f is F => !!f);
}
