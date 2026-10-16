// Banka with foreign currency (client-safe, pure). A payment is in its account's currency (a Polish
// account: PLN) and may carry the original amount of a card payment abroad; a bill has its own
// currency + Kč at the ČNB (national) rate. Amounts are compared in the payment's currency, or in the
// card payment's original currency; Kč only for a Kč payment.

export type MoneyBill = { currency: string; totalAmount: number | null; amountCzk: number | null };

/** What (the uncovered `fraction` of) a bill amounts to in `currency`; null = can't say without a rate. */
export function billValueIn(b: MoneyBill, currency: string, fraction = 1): number | null {
  const v = currency === b.currency ? b.totalAmount : currency === "CZK" ? b.amountCzk : null;
  return v === null ? null : Math.round(v * fraction * 100) / 100;
}

/** 1 234,50 Kč / 95,00 PLN */
export function money(n: number | null | undefined, currency: string): string {
  if (n === null || n === undefined) return "—";
  return `${n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency === "CZK" ? "Kč" : currency}`;
}

/** Several currencies on one line: "1 200,00 Kč + 95,00 PLN" (zeros left out, "0,00 Kč" when all are). */
export function moneyMix(byCurrency: { currency: string; amount: number }[]): string {
  const parts = byCurrency.filter((x) => Math.abs(x.amount) > 0.005).map((x) => money(x.amount, x.currency));
  return parts.length ? parts.join(" + ") : money(0, "CZK");
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

/**
 * How a payment's open amount relates to a bill's open part:
 *   exact    same amount in the payment's currency, or in a card payment's original currency
 *   fx       a Kč payment and a foreign bill within ±3 % in Kč (bank rate vs ČNB)
 * plus the bill's value in the payment's currency (to allocate), when known.
 */
export function compareAmounts(
  t: { currency: string; remaining: number; originalAmount: number | null; originalCurrency: string | null; untouched: boolean },
  b: MoneyBill & { remainingCzk: number }
): { kind: "exact" | "fx"; inTx: number | null } | null {
  const fraction = b.amountCzk ? b.remainingCzk / b.amountCzk : 1;
  const inTx = billValueIn(b, t.currency, fraction);
  if (inTx !== null && near(inTx, t.remaining)) return { kind: "exact", inTx };
  // Card payment abroad: the original amount on the statement equals the receipt.
  if (t.untouched && t.originalCurrency && t.originalAmount !== null) {
    const inOrig = billValueIn(b, t.originalCurrency, fraction);
    if (inOrig !== null && near(inOrig, t.originalAmount)) return { kind: "exact", inTx: t.remaining };
  }
  if (t.currency === "CZK" && b.currency !== "CZK" && b.remainingCzk > 0 && Math.abs(t.remaining - b.remainingCzk) / b.remainingCzk <= 0.03) return { kind: "fx", inTx: t.remaining };
  return null;
}
