// Possible duplicate bills (Účtenky -> Najít možné duplicity, the "možná duplicita" badge). Pure,
// client-safe. The same receipt often exists as two different FILES (a photo + the e-mailed PDF, two
// photos), so this compares what the bills say, strongest evidence first:
//   content     same file content (contentHash) -- e.g. the same receipt in two events
//   amount_date same amount and the same date
//   amount_near same amount, date within ±3 days and the same shop
//   amount_shop same amount and shop, one of the dates unknown
// "Same amount" = the same amount in the same currency, or -- across currencies -- Kč (ČNB) within 1 %,
// so a receipt entered once in PLN and once in Kč still pairs up. Pairs marked "Není duplicita" never come back.
import { fold } from "@/lib/planning-import";

export type DupReason = "content" | "amount_date" | "amount_near" | "amount_shop";
export const DUP_REASONS: DupReason[] = ["content", "amount_date", "amount_near", "amount_shop"];
export type DupBill = { id: string; contentHash: string | null; totalAmount: number | null; currency: string; amountCzk: number | null; billDate: string | null; merchantName: string | null };
export type DupGroup = { reason: DupReason; billIds: string[] };

const DAY = 864e5;
export const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

export function sameAmount(a: DupBill, b: DupBill): boolean {
  if (a.totalAmount !== null && b.totalAmount !== null && a.currency === b.currency && Math.abs(a.totalAmount - b.totalAmount) < 0.005) return true;
  // Kč within 1 % only across currencies (the rates differ); two Kč bills must match exactly.
  if (a.currency === b.currency) return false;
  if (a.amountCzk !== null && b.amountCzk !== null && Math.max(a.amountCzk, b.amountCzk) > 0) return Math.abs(a.amountCzk - b.amountCzk) / Math.max(a.amountCzk, b.amountCzk) <= 0.01;
  return false;
}

const shop = (b: DupBill) => fold(b.merchantName ?? "").replace(/[^a-z0-9]/g, "").slice(0, 6);

/** The strongest reason two bills look like one receipt, or null. */
export function duplicateReason(a: DupBill, b: DupBill): DupReason | null {
  if (a.contentHash && a.contentHash === b.contentHash) return "content";
  if (!sameAmount(a, b)) return null;
  const sameShop = shop(a).length >= 3 && shop(a) === shop(b);
  if (a.billDate && b.billDate) {
    const days = Math.abs(Date.parse(a.billDate) - Date.parse(b.billDate)) / DAY;
    if (days < 1) return "amount_date";
    if (days <= 3 && sameShop) return "amount_near";
    return null;
  }
  return sameShop ? "amount_shop" : null;
}

/**
 * Groups of possible duplicates among `bills` that involve at least one of `focus` (all when
 * omitted). A group's reason is its strongest pair. Dismissed pairs (pairKey) are skipped.
 */
export function findDuplicateGroups(bills: DupBill[], dismissed: Set<string>, focus?: Set<string>): DupGroup[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => (parent.get(x) === x || !parent.has(x) ? x : find(parent.get(x)!));
  const best = new Map<string, DupReason>();
  for (let i = 0; i < bills.length; i++) {
    for (let j = i + 1; j < bills.length; j++) {
      const a = bills[i], b = bills[j];
      if (focus && !focus.has(a.id) && !focus.has(b.id)) continue;
      if (dismissed.has(pairKey(a.id, b.id))) continue;
      const r = duplicateReason(a, b);
      if (!r) continue;
      for (const x of [a.id, b.id]) if (!parent.has(x)) parent.set(x, x);
      const ra = find(a.id), rb = find(b.id);
      const reason = [best.get(ra), best.get(rb), r].filter((x): x is DupReason => !!x).sort((x, y) => DUP_REASONS.indexOf(x) - DUP_REASONS.indexOf(y))[0];
      parent.set(ra, rb);
      best.set(rb, reason);
    }
  }
  const groups = new Map<string, string[]>();
  for (const id of parent.keys()) groups.set(find(id), [...(groups.get(find(id)) ?? []), id]);
  return [...groups.entries()]
    .map(([root, ids]) => ({ reason: best.get(root)!, billIds: ids }))
    .sort((x, y) => DUP_REASONS.indexOf(x.reason) - DUP_REASONS.indexOf(y.reason));
}
