// Banka: pairing SUGGESTIONS (docs/bank-reconciliation.md, design section 6). The app never pairs on
// its own: everything here is a BankMatch with method "suggested" and no confirmedAt -- it counts
// nowhere until a person confirms it. Pairing is by amount + date; merchant / VS / text only break ties.
// suggestPairs is pure (self-check: scripts/check-bank-suggest.ts); runSuggestions loads and stores.
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { fold } from "@/lib/planning-import";
import { accountKey } from "@/lib/bank/classify";
import { compareAmounts } from "@/lib/bank/currency";
import { resolveCanonicalMerchant } from "@/lib/merchant-aliases";

export type SuggestTx = {
  id: string;
  bookingDate: string; // YYYY-MM-DD
  currency: string; // the account's currency
  remaining: number; // in `currency`, still not covered by confirmed pairs, positive
  untouched: boolean; // nothing paired yet (the original amount of a card payment still applies)
  originalAmount: number | null;
  originalCurrency: string | null;
  bankType: string | null;
  text: string; // counterparty name + message + VS, for tie-breakers
  merchantCanonical: string | null;
};
export type SuggestBill = {
  id: string;
  billDate: string | null;
  remaining: number; // Kč (ČNB): amountCzk minus confirmed pairs
  amountCzk: number | null;
  totalAmount: number | null;
  currency: string;
  merchantName: string | null;
  text: string; // notes + file name
};
// Stored as BankMatch.reasons; the screens translate them (bankReason.*).
export type Reason = { k: "amount" } | { k: "fx" } | { k: "date"; d: number } | { k: "merchant"; v: string } | { k: "text" };
// amountCzk: the bill's side (ČNB); amountTx: the payment's side, in its currency.
export type Suggestion = { txId: string; billId: string; tier: "sure" | "possible"; score: number; reasons: Reason[]; amountCzk: number; amountTx: number };

const DAY = 864e5;
const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / DAY);
const isCard = (t: SuggestTx) => /kart/.test(fold(t.bankType ?? ""));

/** Amount: src/lib/bank/currency.ts (the payment's currency, a card payment's original amount, Kč ±3 %). */
const amountMatch = (t: SuggestTx, b: SuggestBill) =>
  compareAmounts(t, { currency: b.currency, totalAmount: b.totalAmount, amountCzk: b.amountCzk ?? b.remaining, remainingCzk: b.remaining });

/** Date: card payments 0 to +5 days after the bill, everything else -15 to +30. */
function dateOk(t: SuggestTx, b: SuggestBill): number | null {
  if (!b.billDate) return null;
  const d = days(t.bookingDate, b.billDate);
  return (isCard(t) ? d >= 0 && d <= 5 : d >= -15 && d <= 30) ? d : null;
}

export function suggestPairs(txs: SuggestTx[], bills: SuggestBill[], rejected: Set<string>): Suggestion[] {
  const out: Suggestion[] = [];
  for (const t of txs) {
    for (const b of bills) {
      if (rejected.has(`${t.id}:${b.id}`)) continue;
      const amount = amountMatch(t, b);
      const d = amount ? dateOk(t, b) : null;
      if (!amount || d === null) continue;
      const reasons: Reason[] = [amount.kind === "exact" ? { k: "amount" } : { k: "fx" }, { k: "date", d }];
      let score = (amount.kind === "exact" ? 100 : 60) + Math.max(0, 20 - Math.abs(d));
      const merchant = b.merchantName ? fold(b.merchantName) : "";
      if (merchant.length >= 3 && (fold(t.text).includes(merchant) || (t.merchantCanonical && fold(t.merchantCanonical) === merchant))) {
        score += 30;
        reasons.push({ k: "merchant", v: b.merchantName! });
      }
      const words = fold(t.text).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && /\d/.test(w));
      if (words.some((w) => fold(b.text).includes(w))) {
        score += 15;
        reasons.push({ k: "text" });
      }
      out.push({ txId: t.id, billId: b.id, tier: "possible", score, reasons, amountCzk: b.remaining, amountTx: Math.min(t.remaining, amount.inTx ?? t.remaining) });
    }
  }
  // Sure = exact amount, inside the window, and the only candidate on both sides.
  const perTx = new Map<string, number>(), perBill = new Map<string, number>();
  for (const s of out) {
    perTx.set(s.txId, (perTx.get(s.txId) ?? 0) + 1);
    perBill.set(s.billId, (perBill.get(s.billId) ?? 0) + 1);
  }
  for (const s of out) if (s.reasons[0].k === "amount" && perTx.get(s.txId) === 1 && perBill.get(s.billId) === 1) s.tier = "sure";
  return out.sort((a, b) => b.score - a.score);
}

/** Bank names come as "NOVAKOVA JANA": same words in any order, without diacritics. */
export const sameName = (a: string | null, b: string | null) => {
  const w = (s: string) => fold(s).split(/[^a-z]+/).filter((x) => x.length > 1).sort().join(" ");
  return !!a && !!b && w(a).length > 0 && w(a) === w(b);
};

/**
 * Re-run for an event: replaces open suggestions (unconfirmed, unrejected), keeps confirmed and
 * rejected rows. Payments to one of the event's payers get a reimbursement hint instead of pairs.
 */
export async function runSuggestions(eventId: string): Promise<{ suggested: number; sure: number; reimbursements: number }> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { organizationId: true } });
  const [txRows, billRows, authors] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: { eventId, classification: "expense" },
      include: { matches: { where: { confirmedAt: { not: null } }, select: { amountCzk: true, amountTx: true } } },
    }),
    prisma.bill.findMany({
      where: { eventId, status: { not: "failed" }, paymentChannel: null, amountCzk: { not: null } },
      include: { bankMatches: { where: { confirmedAt: { not: null } }, select: { amountCzk: true } } },
    }),
    prisma.author.findMany({ where: { organizationId: event.organizationId, active: true }, select: { id: true, canonicalName: true, bankAccountNumber: true, bankCode: true } }),
  ]);

  // Reimbursement: the counterparty is one of the payers (account or name).
  let reimbursements = 0;
  const reimbursed = new Set<string>();
  for (const t of txRows) {
    const key = accountKey(t.counterpartyAccount, t.counterpartyBankCode);
    const author = authors.find((a) => (key && key === accountKey(a.bankAccountNumber, a.bankCode)) || sameName(t.counterpartyName, a.canonicalName) || sameName(t.message, a.canonicalName));
    if ((author?.id ?? null) !== t.reimbursementAuthorId) await prisma.bankTransaction.update({ where: { id: t.id }, data: { reimbursementAuthorId: author?.id ?? null } });
    if (author) {
      reimbursements++;
      reimbursed.add(t.id);
    }
  }

  const sum = (m: { amountCzk: Prisma.Decimal }[]) => m.reduce((s, x) => s + Number(x.amountCzk), 0);
  // A payment's coverage in its own currency (older rows: amountTx empty = amountCzk).
  const sumTx = (m: { amountCzk: Prisma.Decimal; amountTx: Prisma.Decimal | null }[]) => m.reduce((s, x) => s + Number(x.amountTx ?? x.amountCzk), 0);
  const txs: SuggestTx[] = txRows
    .filter((t) => !reimbursed.has(t.id))
    .map((t) => ({
      id: t.id,
      bookingDate: t.bookingDate.toISOString().slice(0, 10),
      currency: t.currency,
      remaining: Math.round((Math.abs(Number(t.amount)) - sumTx(t.matches)) * 100) / 100,
      untouched: t.matches.length === 0,
      originalAmount: t.originalAmount === null ? null : Number(t.originalAmount),
      originalCurrency: t.originalCurrency,
      bankType: t.bankType,
      text: [t.counterpartyName, t.message, t.vs].filter(Boolean).join(" "),
      merchantCanonical: null as string | null,
    }))
    .filter((t) => t.remaining > 0.005);
  // The organization's learned merchant names (MerchantAlias) for the counterparty.
  for (const t of txs) {
    const raw = txRows.find((r) => r.id === t.id)?.counterpartyName ?? null;
    t.merchantCanonical = raw ? await resolveCanonicalMerchant(raw, event.organizationId) : null;
  }
  const bills: SuggestBill[] = billRows
    .map((b) => ({
      id: b.id,
      billDate: b.billDate ? b.billDate.toISOString().slice(0, 10) : null,
      remaining: Math.round((Number(b.amountCzk) - sum(b.bankMatches)) * 100) / 100,
      amountCzk: Number(b.amountCzk),
      totalAmount: b.totalAmount === null ? null : Number(b.totalAmount),
      currency: b.currency,
      merchantName: b.merchantName,
      text: [b.notes, b.originalFilename].filter(Boolean).join(" "),
    }))
    .filter((b) => b.remaining > 0.005);

  const rejected = new Set(
    (await prisma.bankMatch.findMany({ where: { transaction: { eventId }, rejectedAt: { not: null } }, select: { transactionId: true, billId: true } })).map((m) => `${m.transactionId}:${m.billId}`)
  );
  const confirmedPairs = new Set(
    (await prisma.bankMatch.findMany({ where: { transaction: { eventId }, confirmedAt: { not: null } }, select: { transactionId: true, billId: true } })).map((m) => `${m.transactionId}:${m.billId}`)
  );
  const suggestions = suggestPairs(txs, bills, new Set([...rejected, ...confirmedPairs]));

  await prisma.$transaction([
    prisma.bankMatch.deleteMany({ where: { transaction: { eventId }, method: "suggested", confirmedAt: null, rejectedAt: null } }),
    prisma.bankMatch.createMany({
      data: suggestions.map((s) => ({ transactionId: s.txId, billId: s.billId, amountCzk: new Prisma.Decimal(s.amountCzk.toFixed(2)), amountTx: new Prisma.Decimal(s.amountTx.toFixed(2)), method: "suggested" as const, tier: s.tier, score: s.score, reasons: s.reasons })),
      skipDuplicates: true,
    }),
  ]);
  return { suggested: suggestions.length, sure: suggestions.filter((s) => s.tier === "sure").length, reimbursements };
}
