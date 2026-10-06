// Bulk import of permanent documents from Drive (docs/registration-slice7-spec.md):
// which person (Lidé) a Drive file name belongs to. Pure -- no DB -- so
// scripts/test-registration-slice7.ts can check it.

// Words that say what the file is, not whose it is (compared without diacritics).
const NOISE = new Set([
  "prihlaska", "prihlasky", "prihlaseni", "oddil", "oddilu", "do", "na", "a",
  "scan", "scanned", "sken", "skenovano", "img", "image", "foto", "photo", "dokument", "doc", "document",
  "pdf", "jpg", "jpeg", "png", "kopie", "copy", "podepsana", "podepsano", "podpis", "signed", "final",
]);

/** Lower-case words without diacritics (anything but a-z separates; digits go too). */
const words = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/[^a-z]+/).filter(Boolean);

/** The words of a file name that can be a name: no extension, no noise words. */
export function fileNameTokens(fileName: string): string[] {
  return words(fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "")).filter((w) => !NOISE.has(w));
}

export type MatchPerson = { id: string; name: string; firstName: string | null; lastName: string | null };

/**
 * The people whose first and last name words all appear in the file name, in
 * any order. `preferIds` (the event's participants) only come first -- nobody
 * is hidden. A person with only one name word never matches.
 */
export function matchPeople(fileName: string, people: MatchPerson[], preferIds: Set<string> = new Set()): string[] {
  const tokens = new Set(fileNameTokens(fileName));
  const hits = people.filter((p) => {
    const first = words(p.firstName ?? "");
    const last = words(p.lastName ?? "");
    const all = first.length && last.length ? [...first, ...last] : words(p.name);
    return all.length >= 2 && all.every((w) => tokens.has(w));
  });
  return hits.sort((a, b) => Number(preferIds.has(b.id)) - Number(preferIds.has(a.id))).map((p) => p.id);
}
