// Banka: how a bill was paid, for the bill list's Platba column, its filter chips and the manifest
// (docs/bank-reconciliation.md A10). Unconfirmed suggestions count only as "Návrh". A confirmed bank
// pairing wins over a hand-set channel (conflict = both set: shown with a warning).
import { prisma } from "@/lib/prisma";

import type { PaymentState } from "@/lib/bank/payment-states";
export { PAYMENT_STATES, type PaymentState } from "@/lib/bank/payment-states";

export function paymentState(b: { amountCzk: number | null; paymentChannel: "cash" | "other_account" | null; confirmedSum: number; openSuggestions: number }): { state: PaymentState; conflict: boolean } {
  const conflict = b.confirmedSum > 0.005 && !!b.paymentChannel;
  if (b.confirmedSum > 0.005) return { state: b.amountCzk !== null && b.confirmedSum + 0.005 >= b.amountCzk ? "bank" : "partial", conflict };
  if (b.paymentChannel) return { state: b.paymentChannel, conflict };
  return { state: b.openSuggestions > 0 ? "suggested" : "unpaired", conflict };
}

export type BillPayment = { state: PaymentState; conflict: boolean; paidOn: string | null; transactionIds: string[] };

/** getBillPaymentState for many bills at once: billId -> state, last payment date, paired transaction ids. */
export async function getBillPaymentStates(bills: { id: string; amountCzk: { toString(): string } | null; paymentChannel: "cash" | "other_account" | null }[]): Promise<Map<string, BillPayment>> {
  const ids = bills.map((b) => b.id);
  const matches = ids.length
    ? await prisma.bankMatch.findMany({ where: { billId: { in: ids }, rejectedAt: null }, select: { billId: true, amountCzk: true, confirmedAt: true, transactionId: true, transaction: { select: { bookingDate: true } } } })
    : [];
  const out = new Map<string, BillPayment>();
  for (const b of bills) {
    const mine = matches.filter((m) => m.billId === b.id);
    const confirmed = mine.filter((m) => m.confirmedAt);
    const { state, conflict } = paymentState({
      amountCzk: b.amountCzk === null ? null : Number(b.amountCzk.toString()),
      paymentChannel: b.paymentChannel,
      confirmedSum: confirmed.reduce((s, m) => s + Number(m.amountCzk), 0),
      openSuggestions: mine.length - confirmed.length,
    });
    const last = confirmed.map((m) => m.transaction.bookingDate.toISOString().slice(0, 10)).sort().pop() ?? null;
    out.set(b.id, { state, conflict, paidOn: last, transactionIds: confirmed.map((m) => m.transactionId) });
  }
  return out;
}

export const getBillPaymentState = async (bill: Parameters<typeof getBillPaymentStates>[0][number]) => (await getBillPaymentStates([bill])).get(bill.id)!;
