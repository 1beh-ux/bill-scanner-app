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

export type ReceiptLine = { description?: string | null; total?: number | null; assign?: string[] };
export type ShareLine = { description: string; total: number; share: number; people: number };

/**
 * A person's lines of a receipt (each line split evenly among the people assigned to it). `keys` = the person's
 * assignment keys: "a:<payer id>" plus those of payers merged into them (lines keep the old id after a merge).
 */
export function linesFor(lineItems: unknown, keys: string[]): ShareLine[] {
  const lines = Array.isArray(lineItems) ? (lineItems as ReceiptLine[]) : [];
  return lines.flatMap((l) => {
    const at = l.assign?.findIndex((k) => keys.includes(k)) ?? -1;
    if (at < 0 || !l.total || l.total <= 0) return [];
    return [{ description: l.description ?? "", total: l.total, share: evenSplit(l.total, l.assign!.length)[at] ?? 0, people: l.assign!.length }];
  });
}

/** How much of the bill the shares cover; complete only when they add up to the haléř. */
export function splitStatus(totalCzk: number, shares: number[]) {
  const assigned = shares.reduce((s, x) => s + toHal(x), 0);
  const remaining = toHal(totalCzk) - assigned;
  return { assigned: fromHal(assigned), remaining: fromHal(remaining), complete: remaining === 0 };
}

// creditorId null = the event paid (its money / cash box). viaEvent: the event pays the author back and the
// debtor pays the event; else the debtor pays the author directly. Open = not settled on that side yet.
export type DebtShare = { debtorId: string; creditorId: string | null; amountCzk: number; viaEvent: boolean; debtorOpen: boolean; creditorOpen: boolean };

/**
 * The payments page, per person: official = what the event owes them (approved, unpaid bills); personalIn = what
 * the event owes them for personal bills they paid (others' parts, through the event); personalOut = their parts
 * of personal bills going through the event; net = official + personalIn - personalOut (> 0: pay them out,
 * < 0: they pay the event). Person-to-person bills come as `debts`, netted within each pair.
 * A part owed to oneself counts for nothing.
 */
export function netSettlement(official: Map<string, number>, shares: DebtShare[]) {
  const into = new Map<string, number>();
  const out = new Map<string, number>();
  const pairs = new Map<string, number>();
  const add = (m: Map<string, number>, id: string, h: number) => m.set(id, (m.get(id) ?? 0) + h);
  for (const s of shares) {
    if (s.debtorId === s.creditorId) continue;
    const h = toHal(s.amountCzk);
    if (s.viaEvent || !s.creditorId) {
      if (s.debtorOpen) add(out, s.debtorId, h);
      if (s.creditorId && s.creditorOpen) add(into, s.creditorId, h);
    } else if (s.debtorOpen) {
      // One direction per pair (the smaller id first): + = a owes b.
      const [a, b] = [s.debtorId, s.creditorId].sort();
      add(pairs, `${a}|${b}`, s.debtorId === a ? h : -h);
    }
  }
  const ids = new Set([...official.keys(), ...into.keys(), ...out.keys()]);
  const rows = [...ids].map((id) => {
    const off = toHal(official.get(id) ?? 0);
    const i = into.get(id) ?? 0;
    const o = out.get(id) ?? 0;
    return { authorId: id, official: fromHal(off), personalIn: fromHal(i), personalOut: fromHal(o), net: fromHal(off + i - o) };
  });
  const debts = [...pairs]
    .filter(([, h]) => h !== 0)
    .map(([key, h]) => {
      const [a, b] = key.split("|");
      return h > 0 ? { debtorId: a, creditorId: b, amountCzk: fromHal(h) } : { debtorId: b, creditorId: a, amountCzk: fromHal(-h) };
    });
  return { rows, debts };
}

/** Tally ("čárky"): quantity × price per piece, to the haléř. */
export const tallyAmount = (quantity: number, unitPrice: number) => fromHal(Math.round(quantity * toHal(unitPrice)));
