import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { effectiveAmountCzk } from "@/lib/bill-amount";
import { PAYOUT_PAYER_WHERE } from "@/lib/payout";
import { openShares } from "@/lib/personal-bills-server";
import { netSettlement } from "@/lib/personal-bills";
import { linkPath } from "@/lib/settlement-links";

// What is owed to whom in THIS event (never other events -- for admin too).
//   scope=approved  approved, not-yet-paid bills only (the default, "to pay out")
//   scope=all       every bill with a payer, any status, paid and unpaid; the
//                   unpaid total/count (used for the QR) stay unpaid-only and
//                   the paid part is reported next to them.
// Payers come from the bills themselves, so someone since removed from the
// event's payer list (`attached: false`) still shows as long as they are owed.
// Osobní účtenky (2026-10-30): personal bills through the event are netted with the payouts -- the author is
// paid back the others' parts, each person's own part is taken off (net < 0 = they pay the event, to
// `receiver`: the event's bank account, else the treasurer's); person-to-person bills come as `debts`.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") === "all" ? "all" : "approved";

  const bills = await prisma.bill.findMany({
    where: {
      eventId,
      payerAuthorId: { not: null },
      // Only payers whose bills are paid out (not the official account / "no payout" payers).
      payerAuthor: PAYOUT_PAYER_WHERE,
      ...(scope === "approved" ? { status: "approved", paidToAuthor: false } : {}),
    },
    include: {
      payerAuthor: {
        include: {
          bankAudits: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { changedByUser: { select: { displayName: true } } },
          },
        },
      },
    },
    orderBy: { billDate: "asc" },
  });

  const attachedIds = new Set(
    (await prisma.authorEventAccess.findMany({ where: { eventId }, select: { authorId: true } })).map((a) => a.authorId)
  );

  type Row = {
    authorId: string;
    name: string;
    attached: boolean;
    bankAccountNumber: string | null;
    bankCode: string | null;
    lastBankChange: { at: Date; byName: string } | null;
    unpaid: Prisma.Decimal;
    unpaidCount: number;
    paid: Prisma.Decimal;
    paidCount: number;
    items: { merchantName: string | null; amountCzk: string | null; paid: boolean }[];
  };
  const byAuthor = new Map<string, Row>();

  for (const bill of bills) {
    if (!bill.payerAuthorId || !bill.payerAuthor) continue;
    const last = bill.payerAuthor.bankAudits[0];
    const entry =
      byAuthor.get(bill.payerAuthorId) ??
      ({
        authorId: bill.payerAuthorId,
        name: bill.payerAuthor.canonicalName,
        attached: attachedIds.has(bill.payerAuthorId),
        bankAccountNumber: bill.payerAuthor.bankAccountNumber,
        bankCode: bill.payerAuthor.bankCode,
        lastBankChange: last ? { at: last.createdAt, byName: last.changedByUser?.displayName ?? "odkaz pro vyúčtování" } : null,
        unpaid: new Prisma.Decimal(0),
        unpaidCount: 0,
        paid: new Prisma.Decimal(0),
        paidCount: 0,
        items: [],
      } as Row);
    const amountCzk = effectiveAmountCzk(bill);
    if (bill.paidToAuthor) {
      entry.paidCount += 1;
      if (amountCzk !== null) entry.paid = entry.paid.plus(amountCzk);
    } else {
      entry.unpaidCount += 1;
      if (amountCzk !== null) entry.unpaid = entry.unpaid.plus(amountCzk);
    }
    entry.items.push({
      merchantName: bill.merchantName,
      amountCzk: amountCzk !== null ? amountCzk.toString() : null,
      paid: bill.paidToAuthor,
    });
    byAuthor.set(bill.payerAuthorId, entry);
  }

  // Personal bills: people with only personal parts get a row too.
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { treasurerAuthorId: true, bankAccount: { select: { label: true, accountNumber: true, bankCode: true } } } });
  const shares = await openShares(eventId);
  const official = new Map([...byAuthor.values()].map((e) => [e.authorId, Number(e.unpaid.toString())]));
  const net = netSettlement(official, shares);
  const people = new Map(
    (await prisma.author.findMany({ where: { id: { in: [...new Set([...shares.flatMap((s) => [s.debtorId, s.creditorId].filter((x): x is string => !!x)), ...(event.treasurerAuthorId ? [event.treasurerAuthorId] : [])])] } }, select: { id: true, canonicalName: true, bankAccountNumber: true, bankCode: true } })).map((a) => [a.id, a])
  );
  for (const r of net.rows) {
    if (byAuthor.has(r.authorId)) continue;
    const a = people.get(r.authorId);
    if (!a) continue;
    byAuthor.set(r.authorId, { authorId: a.id, name: a.canonicalName, attached: attachedIds.has(a.id), bankAccountNumber: a.bankAccountNumber, bankCode: a.bankCode, lastBankChange: null, unpaid: new Prisma.Decimal(0), unpaidCount: 0, paid: new Prisma.Decimal(0), paidCount: 0, items: [] });
  }
  const netOf = new Map(net.rows.map((r) => [r.authorId, r]));
  const through = shares.filter((s) => (s.viaEvent || !s.creditorId) && s.debtorId !== s.creditorId);
  // What they owe the event (their parts) and what the event owes them (others' parts of bills they paid).
  const personalOutItems = (authorId: string) =>
    through.filter((s) => s.debtorId === authorId && s.debtorOpen).map((s) => ({ merchantName: s.merchantName, amountCzk: s.amountCzk, paidBy: s.creditorId ? people.get(s.creditorId)?.canonicalName ?? null : null }));
  const personalInItems = (authorId: string) => through.filter((s) => s.creditorId === authorId && s.creditorOpen).map((s) => ({ merchantName: s.merchantName, amountCzk: s.amountCzk, debtorName: s.debtorName }));
  // Where people pay the event: its bank account (Banka), else the treasurer's.
  const treasurer = event.treasurerAuthorId ? people.get(event.treasurerAuthorId) ?? null : null;
  const receiver = event.bankAccount
    ? { name: event.bankAccount.label, bankAccountNumber: event.bankAccount.accountNumber, bankCode: event.bankAccount.bankCode }
    : treasurer && { name: treasurer.canonicalName, bankAccountNumber: treasurer.bankAccountNumber, bankCode: treasurer.bankCode };

  // Vyúčtování links (src/lib/settlement-links.ts): each person's link and what they marked there.
  const eventName = (await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true } })).name;
  const links = new Map((await prisma.settlementLink.findMany({ where: { eventId } })).map((l) => [l.authorId, l]));

  const result = Array.from(byAuthor.values())
    .map((e) => ({
      authorId: e.authorId,
      name: e.name,
      attached: e.attached,
      bankAccountNumber: e.bankAccountNumber,
      bankCode: e.bankCode,
      lastBankChange: e.lastBankChange,
      unpaidTotalCzk: e.unpaid.toString(),
      unpaidBillCount: e.unpaidCount,
      paidTotalCzk: e.paid.toString(),
      paidBillCount: e.paidCount,
      items: e.items,
      personalOutCzk: netOf.get(e.authorId)?.personalOut ?? 0,
      personalInCzk: netOf.get(e.authorId)?.personalIn ?? 0,
      personalOutItems: personalOutItems(e.authorId),
      personalInItems: personalInItems(e.authorId),
      netCzk: netOf.get(e.authorId)?.net ?? Number(e.unpaid.toString()),
      link: links.has(e.authorId)
        ? (({ token, claimedAt, receivedAt, acceptedAt, acceptedAmount }) => ({ path: linkPath(eventName, token), claimedAt, receivedAt, acceptedAt, acceptedAmount: acceptedAmount == null ? null : Number(acceptedAmount) }))(links.get(e.authorId)!)
        : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));

  return NextResponse.json({
    rows: result,
    receiver,
    debts: net.debts.map((d) => {
      const claimed = ((links.get(d.debtorId)?.pairClaims ?? {}) as Record<string, string>)[d.creditorId] ?? null;
      const debtor = people.get(d.debtorId);
      const creditor = people.get(d.creditorId);
      return { ...d, claimedAt: claimed, debtorName: debtor?.canonicalName ?? "?", creditorName: creditor?.canonicalName ?? "?", creditorBankAccountNumber: creditor?.bankAccountNumber ?? null, creditorBankCode: creditor?.bankCode ?? null };
    }),
  });
}
