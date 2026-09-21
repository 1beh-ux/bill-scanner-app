// Columns of the bills list (event page /events/[id]/bills). The set and order a
// team wants is stored per event (Event.billsListColumns); null = DEFAULT_BILL_COLUMNS.
//
// `status`, `merchant` and `amount` are REQUIRED: they can be moved but not hidden, so
// the list always shows what a bill is (chip), whose it is (merchant) and what it costs.
// Only fields that exist on Bill are offered (there is no separate description field:
// the free-text one is `notes`).

export type BillColumnKey =
  | "sourceFile"
  | "status"
  | "billDate"
  | "merchant"
  | "note"
  | "category"
  | "payer"
  | "amount"
  | "amountCzk"
  | "paid"
  | "createdAt"
  | "createdBy"
  | "exported";

export const BILL_COLUMNS: { key: BillColumnKey; labelKey: string }[] = [
  { key: "sourceFile", labelKey: "eventDetail.colFilename" },
  { key: "status", labelKey: "common.status" },
  { key: "billDate", labelKey: "billModal.date" },
  { key: "merchant", labelKey: "billsPage.colMerchant" },
  { key: "note", labelKey: "billsPage.colNote" },
  { key: "category", labelKey: "eventDetail.colCategory" },
  { key: "payer", labelKey: "billModal.payer" },
  { key: "amount", labelKey: "billsPage.colAmount" },
  { key: "amountCzk", labelKey: "billsPage.colAmountCzk" },
  { key: "paid", labelKey: "billsPage.colPaid" },
  { key: "createdAt", labelKey: "billsPage.colCreatedAt" },
  { key: "createdBy", labelKey: "billsPage.colCreatedBy" },
  { key: "exported", labelKey: "billsPage.colExported" },
];

export const BILL_COLUMN_KEYS = BILL_COLUMNS.map((c) => c.key);
export const REQUIRED_BILL_COLUMNS: BillColumnKey[] = ["status", "merchant", "amount"];

// The old columns plus paid status, in a sensible order. The source file stays first
// because it is the link that opens the bill.
export const DEFAULT_BILL_COLUMNS: BillColumnKey[] = ["sourceFile", "status", "billDate", "merchant", "category", "payer", "amount", "paid"];

/**
 * Cleans a stored/received column list: unknown keys and duplicates dropped, the
 * required columns put back (appended) if missing. Empty/invalid input -> the default.
 */
export function normalizeBillColumns(input: unknown): BillColumnKey[] {
  if (!Array.isArray(input)) return [...DEFAULT_BILL_COLUMNS];
  const seen = new Set<string>();
  const out: BillColumnKey[] = [];
  for (const k of input) {
    if (typeof k === "string" && (BILL_COLUMN_KEYS as string[]).includes(k) && !seen.has(k)) {
      seen.add(k);
      out.push(k as BillColumnKey);
    }
  }
  if (out.length === 0) return [...DEFAULT_BILL_COLUMNS];
  for (const req of REQUIRED_BILL_COLUMNS) if (!seen.has(req)) out.push(req);
  return out;
}
