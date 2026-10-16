// Banka: everything that turns a suggestion into a pairing or undoes one (docs/bank-reconciliation.md
// A6 / A7). Only these functions set confirmedAt; each writes the bill's audit log. A pairing of a
// reimbursement transaction marks the payer's bills Proplaceno (paid at the booking date) the same
// way the Platby screen does, and remembers that it did (unpairing offers to undo it).
import { Prisma, type BankDifferenceReason } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

const dec = (n: number) => new Prisma.Decimal(n.toFixed(2));
const money = (n: number) => Math.round(n * 100) / 100;

/** CZK of a bill / transaction still not covered by confirmed pairings. */
async function remainingOfBills(billIds: string[]) {
  const bills = await prisma.bill.findMany({
    where: { id: { in: billIds } },
    select: { id: true, eventId: true, amountCzk: true, payerAuthorId: true, paidToAuthor: true, bankMatches: { where: { confirmedAt: { not: null } }, select: { amountCzk: true, transactionId: true } } },
  });
  return bills.map((b) => ({ ...b, remaining: money(Number(b.amountCzk ?? 0) - b.bankMatches.reduce((s, m) => s + Number(m.amountCzk), 0)) }));
}

export type PairError = "not_found" | "not_in_event" | "reason_required" | "nothing_to_pair";

/**
 * Pair one transaction with bills (Párování -> Spárovat): each bill gets its remaining amount; when
 * the sum differs from the payment a reason is required. Existing suggestion rows become manual,
 * confirmed pairings.
 */
export async function pairTransaction(o: { eventId: string; transactionId: string; billIds: string[]; userId: string; differenceReason?: BankDifferenceReason | null }): Promise<{ ok: true; paired: number; markedPaid: number } | { error: PairError; difference?: number }> {
  const tx = await prisma.bankTransaction.findFirst({ where: { id: o.transactionId, eventId: o.eventId }, include: { matches: { where: { confirmedAt: { not: null } }, select: { amountCzk: true } } } });
  if (!tx) return { error: "not_found" };
  const bills = (await remainingOfBills(o.billIds)).filter((b) => b.remaining > 0.005 && !b.bankMatches.some((m) => m.transactionId === tx.id));
  if (bills.some((b) => b.eventId !== o.eventId)) return { error: "not_in_event" };
  if (!bills.length) return { error: "nothing_to_pair" };
  const txRemaining = money(Math.abs(Number(tx.amount)) - tx.matches.reduce((s, m) => s + Number(m.amountCzk), 0));
  const sum = money(bills.reduce((s, b) => s + b.remaining, 0));
  const difference = money(sum - txRemaining);
  if (Math.abs(difference) > 0.005 && !o.differenceReason) return { error: "reason_required", difference };

  // Reimbursement: the payer's own bills get Proplaceno at the payment's booking date.
  const reimburse = (b: { payerAuthorId: string | null; paidToAuthor: boolean }) => !!tx.reimbursementAuthorId && b.payerAuthorId === tx.reimbursementAuthorId && !b.paidToAuthor;
  const now = new Date();
  let markedPaid = 0;
  await prisma.$transaction(async (db) => {
    for (const b of bills) {
      const paid = reimburse(b);
      const data = { amountCzk: dec(b.remaining), method: "manual" as const, differenceReason: Math.abs(difference) > 0.005 ? o.differenceReason ?? null : null, confirmedAt: now, confirmedById: o.userId, rejectedAt: null, rejectedById: null, setPaidToAuthor: paid };
      await db.bankMatch.upsert({ where: { transactionId_billId: { transactionId: tx.id, billId: b.id } }, create: { transactionId: tx.id, billId: b.id, ...data }, update: data });
      await db.billAuditLog.create({ data: { billId: b.id, userId: o.userId, actionType: "bank_pair", fieldName: "bank", newValue: `${tx.bookingDate.toISOString().slice(0, 10)} ${Number(tx.amount).toFixed(2)}` } });
      if (paid) {
        await db.bill.update({ where: { id: b.id }, data: { paidToAuthor: true, paidAt: tx.bookingDate, paidByUserId: o.userId } });
        markedPaid++;
      }
    }
    // Other open suggestions of this payment are moot now.
    await db.bankMatch.deleteMany({ where: { transactionId: tx.id, confirmedAt: null, rejectedAt: null } });
  });
  return { ok: true, paired: bills.length, markedPaid };
}

/**
 * Confirm open suggestions: per transaction its best one (highest score), only when the bill still
 * has that much uncovered and wasn't taken by an earlier one in this run. which = "sure" | ids.
 */
export async function confirmSuggestions(o: { eventId: string; userId: string; transactionIds?: string[]; onlySure?: boolean }) {
  const open = await prisma.bankMatch.findMany({
    where: { transaction: { eventId: o.eventId, ...(o.transactionIds && { id: { in: o.transactionIds } }) }, confirmedAt: null, rejectedAt: null, ...(o.onlySure && { tier: "sure" }) },
    orderBy: { score: "desc" },
  });
  const bestPerTx = new Map<string, (typeof open)[number]>();
  for (const m of open) if (!bestPerTx.has(m.transactionId)) bestPerTx.set(m.transactionId, m);
  const remaining = new Map((await remainingOfBills([...new Set(open.map((m) => m.billId))])).map((b) => [b.id, b.remaining]));
  let confirmed = 0, sum = 0;
  const now = new Date();
  for (const m of bestPerTx.values()) {
    const left = remaining.get(m.billId) ?? 0;
    if (left + 0.005 < Number(m.amountCzk)) continue;
    remaining.set(m.billId, money(left - Number(m.amountCzk)));
    await prisma.$transaction([
      prisma.bankMatch.update({ where: { id: m.id }, data: { confirmedAt: now, confirmedById: o.userId } }),
      prisma.bankMatch.deleteMany({ where: { transactionId: m.transactionId, confirmedAt: null, rejectedAt: null, id: { not: m.id } } }),
      prisma.billAuditLog.create({ data: { billId: m.billId, userId: o.userId, actionType: "bank_pair", fieldName: "bank", newValue: `suggestion ${Number(m.amountCzk).toFixed(2)}` } }),
    ]);
    confirmed++;
    sum += Number(m.amountCzk);
  }
  return { confirmed, sum: money(sum) };
}

/** What a confirm would do (the confirm dialog's count + sum), without doing it. */
export async function previewConfirm(o: { eventId: string; transactionIds?: string[]; onlySure?: boolean }) {
  const open = await prisma.bankMatch.findMany({
    where: { transaction: { eventId: o.eventId, ...(o.transactionIds && { id: { in: o.transactionIds } }) }, confirmedAt: null, rejectedAt: null, ...(o.onlySure && { tier: "sure" }) },
    orderBy: { score: "desc" },
    select: { transactionId: true, amountCzk: true },
  });
  const best = new Map<string, number>();
  for (const m of open) if (!best.has(m.transactionId)) best.set(m.transactionId, Number(m.amountCzk));
  return { count: best.size, sum: money([...best.values()].reduce((s, x) => s + x, 0)) };
}

/** Reject open suggestions (never suggested again for the same pair). */
export async function rejectSuggestions(o: { eventId: string; userId: string; transactionIds?: string[]; matchIds?: string[] }) {
  const where = { transaction: { eventId: o.eventId }, confirmedAt: null, rejectedAt: null, ...(o.transactionIds && { transactionId: { in: o.transactionIds } }), ...(o.matchIds && { id: { in: o.matchIds } }) };
  const rows = await prisma.bankMatch.findMany({ where, select: { id: true, billId: true } });
  const now = new Date();
  await prisma.$transaction([
    prisma.bankMatch.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { rejectedAt: now, rejectedById: o.userId } }),
    ...rows.map((r) => prisma.billAuditLog.create({ data: { billId: r.billId, userId: o.userId, actionType: "bank_reject", fieldName: "bank" } })),
  ]);
  return { rejected: rows.length };
}

/** Undo a confirmed pairing; clearPaid also takes back the Proplaceno this pairing set. */
export async function unpair(o: { eventId: string; matchId: string; userId: string; clearPaid: boolean }) {
  const m = await prisma.bankMatch.findFirst({ where: { id: o.matchId, transaction: { eventId: o.eventId } } });
  if (!m) return { error: "not_found" as const };
  await prisma.$transaction(async (db) => {
    await db.bankMatch.delete({ where: { id: m.id } });
    await db.billAuditLog.create({ data: { billId: m.billId, userId: o.userId, actionType: "bank_unpair", fieldName: "bank", oldValue: Number(m.amountCzk).toFixed(2) } });
    if (o.clearPaid && m.setPaidToAuthor) await db.bill.update({ where: { id: m.billId }, data: { paidToAuthor: false, paidAt: null, paidByUserId: null } });
  });
  return { ok: true as const, wasPaid: m.setPaidToAuthor };
}
