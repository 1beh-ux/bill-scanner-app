// Banka: "Vytvořit doklad z platby" / "Doklad = bankovní výpis" (docs/bank-reconciliation.md A8).
// One bill per outgoing transaction without a confirmed pairing: date, amount (original currency if
// the bank shows it), merchant from the counterparty (learned aliases), paid directly by the event,
// the category last used for that merchant here. No file: documentMissing (or documentFromStatement
// -- the statement is the document). Paired and confirmed at once: the user made it from that payment.
import { Prisma, type Currency } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { resolveCanonicalMerchant } from "@/lib/merchant-aliases";
import { convertToCzk } from "@/lib/exchange-rates";

const CURRENCIES: Currency[] = ["CZK", "PLN", "EUR"];
const dec = (n: number, places = 2) => new Prisma.Decimal(n.toFixed(places));
// Card payments carry the shop in the message ("Nákup: ALBERT 0123, Praha"): the shop part.
const fromMessage = (m: string | null) => (m ? m.replace(/^(nákup|platba kartou|nakup)\s*:?\s*/i, "").split(/[,;]/)[0].trim().slice(0, 100) || null : null);

export async function createBillsFromTransactions(o: { eventId: string; transactionIds: string[]; userId: string; fromStatement: boolean }) {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: o.eventId }, select: { organizationId: true } });
  const txs = await prisma.bankTransaction.findMany({
    where: { id: { in: o.transactionIds }, eventId: o.eventId, amount: { lt: 0 }, matches: { none: { confirmedAt: { not: null } } } },
    orderBy: { bookingDate: "asc" },
  });
  const created: string[] = [];
  for (const tx of txs) {
    const paid = Math.abs(Number(tx.amount)); // in the account's currency
    const raw = tx.counterpartyName ?? fromMessage(tx.message);
    const merchant = raw ? (await resolveCanonicalMerchant(raw, event.organizationId)) ?? raw : null;
    // The receipt's currency: a foreign account's own, or a Kč card payment's original amount.
    const accountForeign = tx.currency !== "CZK" && CURRENCIES.includes(tx.currency as Currency);
    const original = !accountForeign && tx.originalAmount !== null && !!tx.originalCurrency && tx.originalCurrency !== "CZK" && CURRENCIES.includes(tx.originalCurrency as Currency);
    const currency = (accountForeign ? tx.currency : original ? tx.originalCurrency : "CZK") as Currency;
    const total = original ? Number(tx.originalAmount) : paid;
    // Kč always at the ČNB (national) rate, like every other bill -- not the bank's rate.
    const conv = currency === "CZK" ? null : await convertToCzk(new Prisma.Decimal(total.toFixed(2)), currency, tx.bookingDate);
    const czk = currency === "CZK" ? paid : conv ? Number(conv.amountCzk) : tx.currency === "CZK" ? paid : null;
    // The category last used for this merchant in this event.
    const lastCat = merchant
      ? await prisma.billCategory.findFirst({ where: { bill: { eventId: o.eventId, merchantName: merchant } }, orderBy: { bill: { createdAt: "desc" } }, select: { eventCategoryId: true } })
      : null;
    const date = tx.bookingDate.toISOString().slice(0, 10);
    const bill = await prisma.$transaction(async (db) => {
      const b = await db.bill.create({
        data: {
          eventId: o.eventId,
          gcsObjectPath: null,
          originalFilename: `${o.fromStatement ? "Bankovní výpis" : "Platba"} ${date} ${paid.toFixed(2)} ${tx.currency === "CZK" ? "Kč" : tx.currency}`,
          contentHash: `bank:${tx.id}`,
          ingestChannel: "bank",
          createdByUserId: o.userId,
          status: "to_review",
          merchantName: merchant,
          billDate: tx.bookingDate,
          totalAmount: dec(total),
          currency,
          amountCzk: czk === null ? null : dec(czk),
          exchangeRateUsed: currency === "CZK" ? dec(1, 6) : conv ? conv.rateUsed : null,
          exchangeRateDate: currency === "CZK" ? tx.bookingDate : conv ? conv.rateDate : null,
          // Paid directly by the event (no payer): nothing to reimburse.
          payerAuthorId: null,
          paidToAuthor: true,
          documentMissing: !o.fromStatement,
          documentFromStatement: o.fromStatement,
          notes: [tx.message, tx.vs ? `VS ${tx.vs}` : null].filter(Boolean).join(" · ") || null,
        },
      });
      if (lastCat) await db.billCategory.create({ data: { billId: b.id, eventCategoryId: lastCat.eventCategoryId, amount: dec(total), amountCzk: czk === null ? null : dec(czk) } });
      // Bill side at ČNB, payment side as booked; a different Kč is the bank's rate (kurzový rozdíl).
      const fxDiff = tx.currency === "CZK" && czk !== null && Math.abs(czk - paid) > 0.005;
      await db.bankMatch.upsert({
        where: { transactionId_billId: { transactionId: tx.id, billId: b.id } },
        create: { transactionId: tx.id, billId: b.id, amountCzk: dec(czk ?? 0), amountTx: dec(paid), differenceReason: fxDiff ? "fx" : null, method: "manual", confirmedAt: new Date(), confirmedById: o.userId },
        update: {},
      });
      await db.bankMatch.deleteMany({ where: { transactionId: tx.id, confirmedAt: null, rejectedAt: null } });
      await db.billAuditLog.create({ data: { billId: b.id, userId: o.userId, actionType: "bank_create", fieldName: "bank", newValue: `${date} ${paid.toFixed(2)} ${tx.currency}` } });
      if (o.fromStatement) await db.bankTransaction.update({ where: { id: tx.id }, data: { noDocumentNeeded: true } });
      return b;
    });
    created.push(bill.id);
  }
  return { created: created.length, skipped: o.transactionIds.length - created.length, billIds: created };
}
