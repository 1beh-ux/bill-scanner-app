import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBank } from "@/lib/bank/guard";
import { inSeries, totals, tabWhere } from "@/lib/bank/tx-query";
import { getBillPaymentStates } from "@/lib/bank/payment-state";

// Banka -> Přehled (docs/bank-reconciliation.md A9): count + sum per card, aggregated in the database.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireBank(id);
  if ("error" in ctx) return ctx.error;
  const ev = { eventId: id };
  const expense = { ...ev, classification: "expense" as const };
  const [all, paired, sure, possible, unpaired, cashOut, nodoc, links, bills, privateRows, authors] = await inSeries([
    () => totals(ev),
    () => totals({ ...expense, matches: { some: { confirmedAt: { not: null } } } }),
    () => totals({ AND: [expense, tabWhere("suggested", "sure"), { matches: { none: { confirmedAt: { not: null } } } }] }),
    () => totals({ AND: [expense, tabWhere("suggested", "possible"), { matches: { none: { confirmedAt: { not: null } } } }] }),
    () => totals({ ...expense, noDocumentNeeded: false, matches: { none: { OR: [{ confirmedAt: { not: null } }, { rejectedAt: null }] } } }),
    () => totals({ ...ev, classification: "cash" }),
    () => totals({ AND: [ev, tabWhere("nodoc")] }),
    () => prisma.eventBankAccount.findMany({ where: ev, include: { bankAccount: { select: { label: true, accountNumber: true, bankCode: true, currency: true, lastSyncResult: true } } } }),
    () => prisma.bill.findMany({ where: { ...ev, status: { not: "failed" } }, select: { id: true, amountCzk: true, paymentChannel: true, documentMissing: true } }),
    () => prisma.bankTransaction.groupBy({ by: ["personAuthorId", "currency"], where: { ...ev, classification: "private" }, _sum: { amount: true }, _count: true }),
    () => prisma.author.findMany({ where: { organizationId: ctx.event.organizationId }, select: { id: true, canonicalName: true } }),
  ] as const);
  const privateSigned = await inSeries([
    () => prisma.bankTransaction.groupBy({ by: ["personAuthorId", "currency"], where: { ...ev, classification: "private", amount: { lt: 0 } }, _sum: { amount: true } }),
    () => prisma.bankTransaction.groupBy({ by: ["personAuthorId", "currency"], where: { ...ev, classification: "private", amount: { gt: 0 } }, _sum: { amount: true } }),
  ] as const);
  const states = await getBillPaymentStates(bills);
  const docs: Record<string, { count: number; sum: number }> = {};
  for (const b of bills) {
    const s = states.get(b.id)!.state;
    const k = s === "bank" || s === "partial" ? "bank" : s === "cash" ? "cash" : s === "other_account" ? "other_account" : "uncovered";
    docs[k] = { count: (docs[k]?.count ?? 0) + 1, sum: (docs[k]?.sum ?? 0) + Number(b.amountCzk ?? 0) };
  }
  const name = new Map(authors.map((a) => [a.id, a.canonicalName]));
  const cashBills = bills.filter((b) => b.paymentChannel === "cash");
  return NextResponse.json({
    accounts: links.map((l) => {
      const info = (l.bankAccount.lastSyncResult as { info?: { openingBalance?: number | null; closingBalance?: number | null } } | null)?.info;
      return { label: l.bankAccount.label, number: `${l.bankAccount.accountNumber}/${l.bankAccount.bankCode}`, currency: l.bankAccount.currency, openingBalance: info?.openingBalance ?? null, closingBalance: info?.closingBalance ?? null };
    }),
    all,
    pairing: { paired, sure, possible, unpaired },
    documents: docs,
    missingDocuments: { count: bills.filter((b) => b.documentMissing).length, sum: bills.filter((b) => b.documentMissing).reduce((s, b) => s + Number(b.amountCzk ?? 0), 0) },
    // Per currency (a Polish account withdraws PLN); bills Hotově in Kč (ČNB).
    cash: { withdrawn: cashOut.byCurrency.map((x) => ({ currency: x.currency, amount: Math.abs(x.expense) })), withdrawals: cashOut.count, billsCash: cashBills.reduce((s, b) => s + Number(b.amountCzk ?? 0), 0), billsCashCount: cashBills.length },
    // Per person and currency.
    private: privateRows.map((r) => {
      const same = (x: { personAuthorId: string | null; currency: string }) => x.personAuthorId === r.personAuthorId && x.currency === r.currency;
      const out = Number(privateSigned[0].find(same)?._sum.amount ?? 0);
      const inc = Number(privateSigned[1].find(same)?._sum.amount ?? 0);
      return { personId: r.personAuthorId, currency: r.currency, name: r.personAuthorId ? name.get(r.personAuthorId) ?? null : null, out, in: inc, saldo: Math.round((out + inc) * 100) / 100, count: r._count };
    }),
    nodoc,
  });
}
