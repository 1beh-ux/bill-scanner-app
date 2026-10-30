// Osobní účtenky (2026-10-30): splitting a purchase between people and netting it with the official payouts.
// Pure, client-safe; amounts in CZK, computed in haléře (integers) so the parts always add up exactly.
export const toHal = (czk: number | string | { toString(): string }) => Math.round(Number(czk.toString()) * 100);
export const fromHal = (h: number) => h / 100;

/** Even split: n parts of total, the remaining haléře go to the first ones (500 / 3 = 166.67, 166.67, 166.66). */
export function evenSplit(totalCzk: number, n: number): number[] {
  if (n <= 0) return [];
  const total = toHal(totalCzk);
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => fromHal(base + (i < total - base * n ? 1 : 0)));
}

/** How much of the bill the shares cover; complete only when they add up to the haléř. */
export function splitStatus(totalCzk: number, shares: number[]) {
  const assigned = shares.reduce((s, x) => s + toHal(x), 0);
  const remaining = toHal(totalCzk) - assigned;
  return { assigned: fromHal(assigned), remaining: fromHal(remaining), complete: remaining === 0 };
}

export type DebtShare = { debtorId: string; creditorId: string; amountCzk: number };

/**
 * The payments page: per person, official = what the event owes them (approved, unpaid bills), toTreasurer = their
 * unsettled personal shares of bills the treasurer paid; net = official - toTreasurer (> 0: pay them, < 0: they
 * pay the treasurer). Shares between other people stay person to person (pairs), netted within each pair.
 * A share owed to oneself counts for nothing.
 */
export function netSettlement(treasurerId: string | null, official: Map<string, number>, shares: DebtShare[]) {
  const toTreasurer = new Map<string, number>();
  const pairs = new Map<string, number>();
  for (const s of shares) {
    if (s.debtorId === s.creditorId) continue;
    const h = toHal(s.amountCzk);
    if (treasurerId && s.creditorId === treasurerId) toTreasurer.set(s.debtorId, (toTreasurer.get(s.debtorId) ?? 0) + h);
    else {
      // One direction per pair (the smaller id first): + = a owes b.
      const [a, b] = [s.debtorId, s.creditorId].sort();
      const key = `${a}|${b}`;
      pairs.set(key, (pairs.get(key) ?? 0) + (s.debtorId === a ? h : -h));
    }
  }
  const ids = new Set([...official.keys(), ...toTreasurer.keys()]);
  const rows = [...ids].map((id) => {
    const off = toHal(official.get(id) ?? 0);
    const tt = toTreasurer.get(id) ?? 0;
    return { authorId: id, official: fromHal(off), toTreasurer: fromHal(tt), net: fromHal(off - tt) };
  });
  const debts = [...pairs]
    .filter(([, h]) => h !== 0)
    .map(([key, h]) => {
      const [a, b] = key.split("|");
      return h > 0 ? { debtorId: a, creditorId: b, amountCzk: fromHal(h) } : { debtorId: b, creditorId: a, amountCzk: fromHal(-h) };
    });
  return { rows, debts };
}
