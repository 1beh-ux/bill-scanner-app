// Pages of a PDF bill: splitting one multi-page bill into several (the import page's
// "Stránky" editor, POST /api/bills/[id]/split) and joining bills back into one
// (POST /api/events/[id]/bills/merge). Pure helpers, shared by the routes and the editor.

/** 0-based page indices of the source PDF, one array per new bill, in the new page order. */
export type PageGroups = number[][];

export function validGroups(groups: unknown, pageCount: number): groups is PageGroups {
  if (!Array.isArray(groups) || groups.length === 0) return false;
  const seen = new Set<number>();
  for (const g of groups) {
    if (!Array.isArray(g) || g.length === 0) return false;
    for (const p of g) {
      if (!Number.isInteger(p) || p < 0 || p >= pageCount || seen.has(p)) return false;
      seen.add(p);
    }
  }
  return true;
}

/** The whole file, untouched: nothing to do. */
export function isWholeFile(groups: PageGroups, pageCount: number): boolean {
  return groups.length === 1 && groups[0].length === pageCount && groups[0].every((p, i) => p === i);
}

/** Editor state -> groups: kept pages in order, a cut after a page closes its group. */
export function groupsFrom(pages: { page: number; removed: boolean }[], cutAfter: Set<number>): PageGroups {
  const groups: PageGroups = [];
  let current: number[] = [];
  for (const { page, removed } of pages) {
    if (removed) continue;
    current.push(page);
    if (cutAfter.has(page)) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/** Quick choice "po N stranách": a cut after every Nth kept page (0 = keep together). */
export function cutsEvery(pages: { page: number; removed: boolean }[], n: number): Set<number> {
  const kept = pages.filter((p) => !p.removed);
  return new Set(n > 0 ? kept.filter((_, i) => (i + 1) % n === 0 && i < kept.length - 1).map((p) => p.page) : []);
}

/** "strana 3 z 5", "strany 1–3 z 5", "strany 4, 2 z 5" (1-based for people). */
export function pagesLabel(pages: number[], pageCount: number): string {
  const n = pages.map((p) => p + 1);
  if (n.length === 1) return `strana ${n[0]} z ${pageCount}`;
  const consecutive = n.every((p, i) => i === 0 || p === n[i - 1] + 1);
  return `strany ${consecutive ? `${n[0]}–${n[n.length - 1]}` : n.join(", ")} z ${pageCount}`;
}

/** File name without our page / merge suffixes and the .pdf extension. */
export function baseFilename(name: string): string {
  return name
    .replace(/\.pdf$/i, "")
    .replace(/\s*\((stran[ay] [\d,–\s]+ z \d+|sloučeno)\)/gi, "")
    .trim();
}

/** Why a bill's pages can't be split / merged now (null = they can). Same locks as deleting it,
 * plus money already tied to it: a confirmed bank pairing or Proplaceno would be lost. */
export function pagesEditBlock(
  bill: { status: string; paidToAuthor: boolean; gcsObjectPath: string | null },
  opts: { eventClosed: boolean; bankPaired: boolean }
): string | null {
  if (opts.eventClosed) return "event_closed_locked";
  if (bill.status === "approved") return "bill_approved_locked";
  if (bill.status === "queued" || bill.status === "processing") return "bill_processing_locked";
  if (!bill.gcsObjectPath) return "no_file";
  if (opts.bankPaired) return "bank_paired";
  if (bill.paidToAuthor) return "paid";
  return null;
}
