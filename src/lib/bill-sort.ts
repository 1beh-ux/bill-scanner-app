// Bill list sorting (Excel-like): numbers by value, dates by time, text alphabetically in Czech
// (Č after C, "10" after "9"); empty values always last, whatever the direction. Client-safe.
export type SortDir = "asc" | "desc";
export type SortValue = number | string | null;

const collator = new Intl.Collator("cs", { numeric: true, sensitivity: "base" });

export function compareValues(a: SortValue, b: SortValue, dir: SortDir): number {
  const empty = (v: SortValue) => v === null || v === "" || (typeof v === "number" && Number.isNaN(v));
  if (empty(a) || empty(b)) return empty(a) === empty(b) ? 0 : empty(a) ? 1 : -1;
  const c = typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b));
  return dir === "asc" ? c : -c;
}

/** Stable sort by a key function (equal keys keep their current order). */
export function sortBy<T>(items: T[], key: (item: T) => SortValue, dir: SortDir): T[] {
  return items.map((item, i) => ({ item, i, k: key(item) })).sort((x, y) => compareValues(x.k, y.k, dir) || x.i - y.i).map((x) => x.item);
}

/** Click on a column title: none -> asc -> desc -> none (another column starts at asc). */
export function nextSort(current: { col: string; dir: SortDir } | null, col: string): { col: string; dir: SortDir } | null {
  if (!current || current.col !== col) return { col, dir: "asc" };
  return current.dir === "asc" ? { col, dir: "desc" } : null;
}
