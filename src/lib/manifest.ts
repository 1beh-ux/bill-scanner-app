// Layout of the bills manifest sheet written by the Drive export (src/lib/drive-export.ts).
//
// Fixed columns first, then ONE PAIR OF COLUMNS PER CATEGORY -- "Kategorie n" +
// "Částka kat. n (Kč)" -- as many pairs as the most-split bill in the event has
// (at least one). A bill with fewer categories leaves its extra pairs empty. Category
// amounts are the CZK split stored on BillCategory; for a single-category bill the
// pair equals the bill total. No VAT / IČO / invoice number, on purpose.

export const PAYER_EVENT_LABEL = "Akce (bez proplacení)"; // payer column when nobody paid out of pocket
export const PAID_DIRECTLY_LABEL = "Akce hradí přímo"; // "Proplaceno" column for the same case

export interface ManifestBill {
  billDate: Date | null;
  merchantName: string | null;
  totalAmount: { toString(): string } | null;
  currency: string;
  amountCzk: { toString(): string } | null;
  payerAuthorId: string | null;
  payerAuthor: { canonicalName: string } | null;
  paidToAuthor: boolean;
  exportFilename: string | null;
  categories: { amountCzk: { toString(): string } | null; eventCategory: { name: string } }[];
}

export const MANIFEST_FIXED_HEADER = ["Datum", "Obchod", "Částka", "Měna", "Částka Kč", "Plátce", "Proplaceno", "Soubor", "Odkaz"];

export function paidOutLabel(payerAuthorId: string | null, paidToAuthor: boolean): string {
  if (!payerAuthorId) return PAID_DIRECTLY_LABEL;
  return paidToAuthor ? "Ano" : "Ne";
}

/** Number of category column pairs needed (>= 1). */
export function categoryPairCount(bills: Pick<ManifestBill, "categories">[]): number {
  return Math.max(1, ...bills.map((b) => b.categories.length));
}

export function manifestHeader(pairs: number): string[] {
  const header = [...MANIFEST_FIXED_HEADER];
  for (let i = 1; i <= pairs; i++) header.push(`Kategorie ${i}`, `Částka kat. ${i} (Kč)`);
  return header;
}

/**
 * `links` = Drive link per bill (parallel to `bills`). Categories are ordered by name so
 * the columns are stable between runs.
 */
export function buildManifestRows(bills: ManifestBill[], links: string[]): (string | number)[][] {
  const pairs = categoryPairCount(bills);
  const rows = bills.map((b, i) => {
    const cats = [...b.categories].sort((x, y) => x.eventCategory.name.localeCompare(y.eventCategory.name, "cs"));
    const row: (string | number)[] = [
      b.billDate ? b.billDate.toISOString().slice(0, 10) : "",
      b.merchantName ?? "",
      b.totalAmount?.toString() ?? "",
      b.currency,
      b.amountCzk?.toString() ?? "",
      b.payerAuthor?.canonicalName ?? PAYER_EVENT_LABEL,
      paidOutLabel(b.payerAuthorId, b.paidToAuthor),
      b.exportFilename ?? "",
      links[i] ?? "",
    ];
    for (let p = 0; p < pairs; p++) {
      const c = cats[p];
      if (!c) {
        row.push("", "");
        continue;
      }
      // One category = the whole bill, so its amount is the bill's CZK total even when the split row has none.
      const amount = cats.length === 1 ? (c.amountCzk ?? b.amountCzk) : c.amountCzk;
      row.push(c.eventCategory.name, amount?.toString() ?? "");
    }
    return row;
  });
  return [manifestHeader(pairs), ...rows];
}
