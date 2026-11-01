// The public Vyúčtování page's data (src/lib/settlement-links.ts): only this person's lines -- what they paid for
// the event, their personal parts (with the receipt lines assigned to them), what they paid for others, the
// result and the person-to-person debts. Never other people's bank details except where they are to be paid.
import { prisma } from "@/lib/prisma";
import { effectiveAmountCzk } from "@/lib/bill-amount";
import { PAYOUT_PAYER_WHERE } from "@/lib/payout";
import { evenSplit } from "@/lib/personal-bills";
import { eventNetting, pairSource, receiverOf } from "@/lib/settlement-links";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
type LineItem = { description?: string | null; total?: number | null; assign?: string[] };

export async function buildStatement(link: { id: string; eventId: string; authorId: string; variableSymbol: string; claimedAt: Date | null; receivedAt: Date | null; pairClaims: unknown }) {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: link.eventId }, select: { id: true, name: true, startDate: true, endDate: true, status: true, treasurerAuthorId: true, settlementReceiver: true, bankAccountId: true, organization: { select: { name: true } } } });
  const person = await prisma.author.findUniqueOrThrow({ where: { id: link.authorId }, select: { id: true, canonicalName: true, bankAccountNumber: true, bankCode: true, payoutNeeded: true, isOfficialAccount: true } });
  const key = `a:${person.id}`;

  const [bills, myShares, othersShares, netting, receiver] = await Promise.all([
    prisma.bill.findMany({
      where: { eventId: event.id, payerAuthorId: person.id, payerAuthor: PAYOUT_PAYER_WHERE, status: { not: "failed" } },
      select: { billDate: true, merchantName: true, amountCzk: true, totalAmount: true, currency: true, status: true, paidToAuthor: true },
      orderBy: { billDate: "asc" },
    }),
    prisma.personalBillShare.findMany({
      where: { authorId: person.id, personalBill: { eventId: event.id } },
      include: { personalBill: { select: { authorId: true, viaEvent: true, merchantName: true, billDate: true, unitLabel: true, unitPrice: true, lineItems: true, splitMode: true, amountCzk: true, author: { select: { canonicalName: true } }, _count: { select: { shares: true } } } } },
    }),
    prisma.personalBillShare.findMany({
      where: { authorId: { not: person.id }, personalBill: { eventId: event.id, authorId: person.id, viaEvent: true } },
      include: { author: { select: { canonicalName: true } }, personalBill: { select: { merchantName: true, unitLabel: true, billDate: true } } },
    }),
    eventNetting(event.id),
    receiverOf(event),
  ]);

  const row = netting.net.rows.find((r) => r.authorId === person.id);
  const names = new Map((await prisma.author.findMany({ where: { id: { in: netting.net.debts.flatMap((d) => [d.debtorId, d.creditorId]) } }, select: { id: true, canonicalName: true, bankAccountNumber: true, bankCode: true, fioTokenEncrypted: true } })).map((a) => [a.id, a]));
  const claims = (link.pairClaims && typeof link.pairClaims === "object" ? link.pairClaims : {}) as Record<string, string>;
  // The debtors' own claims, for what is owed to this person.
  const debtorLinks = await prisma.settlementLink.findMany({ where: { eventId: event.id, authorId: { in: netting.net.debts.filter((d) => d.creditorId === person.id).map((d) => d.debtorId) } }, select: { authorId: true, pairClaims: true } });

  return {
    event: { name: event.name, organization: event.organization.name, startDate: iso(event.startDate), endDate: iso(event.endDate), closed: event.status === "closed" },
    person: { name: person.canonicalName, bankAccountNumber: person.bankAccountNumber, bankCode: person.bankCode },
    receiver: receiver && { name: receiver.name, bankAccountNumber: receiver.bankAccountNumber, bankCode: receiver.bankCode, autoConfirm: receiver.autoConfirm },
    // Without a bank connection no VS is shown (the QR still works; confirmed by hand).
    variableSymbol: receiver?.autoConfirm ? link.variableSymbol : null,
    official: bills.map((b) => ({ date: iso(b.billDate), merchant: b.merchantName, amountCzk: Number(effectiveAmountCzk(b) ?? 0), state: b.paidToAuthor ? "paid" : b.status === "approved" ? "approved" : "waiting" })),
    own: myShares.map((s) => {
      const b = s.personalBill;
      const lines = (Array.isArray(b.lineItems) ? (b.lineItems as LineItem[]) : [])
        .filter((l) => l.assign?.includes(key) && l.total && l.total > 0)
        .map((l) => ({ description: l.description ?? "", total: l.total!, share: evenSplit(l.total!, l.assign!.length)[l.assign!.indexOf(key)] ?? 0, people: l.assign!.length }));
      return {
        date: iso(b.billDate),
        title: b.unitLabel ?? b.merchantName ?? "",
        amountCzk: Number(s.amountCzk),
        quantity: s.quantity == null ? null : Number(s.quantity),
        unitPrice: b.unitPrice == null ? null : Number(b.unitPrice),
        of: b.splitMode === "even" && !lines.length ? b._count.shares : null,
        billTotal: b.amountCzk == null ? null : Number(b.amountCzk),
        lines,
        paidBy: b.author?.canonicalName ?? null,
        mine: b.authorId === person.id,
        via: b.viaEvent || !b.authorId ? "event" : "direct",
        settled: !!s.settledAt,
      };
    }),
    paidForOthers: othersShares.map((s) => ({ date: iso(s.personalBill.billDate), title: s.personalBill.unitLabel ?? s.personalBill.merchantName ?? "", debtor: s.author.canonicalName, amountCzk: Number(s.amountCzk), paidOut: !!s.creditorPaidAt })),
    result: { official: row?.official ?? 0, personalIn: row?.personalIn ?? 0, personalOut: row?.personalOut ?? 0, net: row?.net ?? 0 },
    iOwe: netting.net.debts
      .filter((d) => d.debtorId === person.id)
      .map((d) => {
        const c = names.get(d.creditorId);
        // Readable by the bank (their own Fio token, or the receiver's same account): the VS + "Zkontrolovat platbu".
        const autoConfirm = !!pairSource(c, receiver);
        return { creditorId: d.creditorId, name: c?.canonicalName ?? "?", amountCzk: d.amountCzk, bankAccountNumber: c?.bankAccountNumber ?? null, bankCode: c?.bankCode ?? null, claimedAt: claims[d.creditorId] ?? null, autoConfirm, variableSymbol: autoConfirm ? link.variableSymbol : null };
      }),
    owedToMe: netting.net.debts
      .filter((d) => d.creditorId === person.id)
      .map((d) => ({ debtorId: d.debtorId, name: names.get(d.debtorId)?.canonicalName ?? "?", amountCzk: d.amountCzk, claimedAt: ((debtorLinks.find((l) => l.authorId === d.debtorId)?.pairClaims ?? {}) as Record<string, string>)[person.id] ?? null })),
    status: {
      claimedAt: link.claimedAt,
      receivedAt: link.receivedAt,
      // Something was paid out to them (the event sent money): "Peníze jsem dostal(a)" makes sense.
      paidOut: bills.some((b) => b.paidToAuthor) || othersShares.some((s) => s.creditorPaidAt),
    },
  };
}
export type Statement = Awaited<ReturnType<typeof buildStatement>>;
