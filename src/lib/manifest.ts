import { needsPayout } from "@/lib/payout";
import type { Settlement } from "@/lib/settlement";

// Layout of the bills manifest sheet written by the Drive export (src/lib/drive-export.ts).
//
// Two category layouts (Event.manifestCategoryMode): "columns" = one column per category used
// by any bill, named by the category, CZK amounts only (numbers, so they can be summed); else
// (default "pairs"):
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
  payerAuthor: { canonicalName: string; isOfficialAccount?: boolean; payoutNeeded?: boolean } | null;
  paidToAuthor: boolean;
  exportFilename: string | null;
  categories: { eventCategoryId?: string; amountCzk: { toString(): string } | null; eventCategory: { name: string } }[];
}

export const MANIFEST_FIXED_HEADER = ["Datum", "Obchod", "Částka", "Měna", "Částka Kč", "Plátce", "Proplaceno", "Soubor", "Odkaz"];

export const NO_PAYOUT_LABEL = "Bez proplacení"; // official account / payer marked "no payout"

export function paidOutLabel(payerAuthorId: string | null, paidToAuthor: boolean, payer?: ManifestBill["payerAuthor"]): string {
  if (!payerAuthorId) return PAID_DIRECTLY_LABEL;
  if (!needsPayout(payer)) return NO_PAYOUT_LABEL;
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
export function buildManifestRows(bills: ManifestBill[], links: string[], mode: "pairs" | "columns" = "pairs"): (string | number)[][] {
  if (mode === "columns") return buildColumnRows(bills, links);
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
      paidOutLabel(b.payerAuthorId, b.paidToAuthor, b.payerAuthor),
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

const fixedCells = (b: ManifestBill, link: string): (string | number)[] => [
  b.billDate ? b.billDate.toISOString().slice(0, 10) : "",
  b.merchantName ?? "",
  b.totalAmount?.toString() ?? "",
  b.currency,
  b.amountCzk?.toString() ?? "",
  b.payerAuthor?.canonicalName ?? PAYER_EVENT_LABEL,
  paidOutLabel(b.payerAuthorId, b.paidToAuthor, b.payerAuthor),
  b.exportFilename ?? "",
  link,
];

/** "columns": one column per category used by any bill (by name), the bill's CZK amount in it. */
function buildColumnRows(bills: ManifestBill[], links: string[]): (string | number)[][] {
  const names = [...new Set(bills.flatMap((b) => b.categories.map((c) => c.eventCategory.name)))].sort((a, b) => a.localeCompare(b, "cs"));
  const rows = bills.map((b, i) => {
    const row = fixedCells(b, links[i] ?? "");
    for (const name of names) {
      const c = b.categories.find((x) => x.eventCategory.name === name);
      const amount = c ? (b.categories.length === 1 ? (c.amountCzk ?? b.amountCzk) : c.amountCzk) : null;
      row.push(amount === null || amount === undefined ? "" : Number(amount.toString()));
    }
    return row;
  });
  return [[...MANIFEST_FIXED_HEADER, ...names], ...rows];
}

export const SUMMARY_SHEET_TITLE = "Souhrn";

/**
 * The manifest's second sheet: per category budget / spent / from the official account / in cash,
 * the deposits, and the settlement with the organization (src/lib/settlement.ts).
 */
export function buildSummaryRows(
  eventName: string,
  s: Settlement,
  deposits: { amountCzk: { toString(): string }; receivedAt: Date; note: string | null }[],
  officialAccount: string | null
): (string | number)[][] {
  const rows: (string | number)[][] = [
    [`Souhrn – ${eventName}`],
    ["Schválené účtenky; „z oficiálního účtu“ = bez plátce (Akce) nebo plátce označený jako oficiální účet organizace, „hotově“ = vše ostatní."],
    [],
    ["Kategorie", "Rozpočet", "Utraceno celkem", "Z oficiálního účtu", "Hotově", "Zbývá z rozpočtu"],
    ...s.lines.map((l) => [l.name, l.budget, l.spent, l.official, l.cash, l.budget ? Math.round((l.budget - l.spent) * 100) / 100 : ""]),
    ["Celkem", s.total.budget, s.total.spent, s.total.official, s.total.cash, s.total.budget ? Math.round((s.total.budget - s.total.spent) * 100) / 100 : ""],
    [],
    ["Zálohy od organizace", "Datum", "Částka", "Poznámka"],
    ...deposits.map((d, i) => [`Záloha ${i + 1}`, d.receivedAt.toISOString().slice(0, 10), Number(d.amountCzk.toString()), d.note ?? ""]),
    ["Zálohy celkem", "", s.depositsTotal],
    [],
    ["Vyúčtování"],
    ["Rozpočet celkem", s.total.budget],
    ["Utraceno celkem", s.total.spent],
    ["Utraceno z rozpočtu (%)", s.spentPercent ?? ""],
    ["Zaplaceno z oficiálního účtu", s.total.official],
    ["Zaplaceno hotově", s.total.cash],
    ["Zálohy", s.depositsTotal],
    [s.toReturn >= 0 ? "Vrátit organizaci" : "Organizace doplatí akci", Math.abs(s.toReturn)],
    ...(officialAccount && s.toReturn > 0 ? [["Účet organizace pro vrácení", officialAccount]] : []),
    ...(s.excluded ? [["Nezapočteno (účtenky bez částky v Kč)", s.excluded]] : []),
  ];
  return rows;
}
