// Hromadná úprava odpovědí (2026-10-27): one field of an event's participants -- its distinct answers
// (trimmed, case-insensitive, with counts), and clearing / replacing the picked ones (e.g. every "ne" in
// Alergie). Pure; the route does the DB side.
export const answerKey = (v: string) => v.trim().toLowerCase();

/** Distinct answers, the most frequent first (the first spelling of each is shown). */
export function distinctAnswers(values: (string | undefined)[]): { value: string; count: number }[] {
  const out = new Map<string, { value: string; count: number }>();
  for (const raw of values) {
    if (!raw?.trim()) continue;
    const k = answerKey(raw);
    const hit = out.get(k);
    if (hit) hit.count++;
    else out.set(k, { value: raw.trim(), count: 1 });
  }
  return [...out.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "cs"));
}

/** The new value of one answer: unchanged when not picked, "" (cleared) or the replacement. */
export function bulkAnswer(current: string | undefined, picked: Set<string>, replacement: string | null): string | undefined {
  if (!current?.trim() || !picked.has(answerKey(current))) return current;
  return replacement ?? "";
}
