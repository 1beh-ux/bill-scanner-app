import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { effectiveAmountCzk } from "@/lib/bill-amount";

// What is owed to whom in THIS event (never other events -- for admin too).
//   scope=approved  approved, not-yet-paid bills only (the default, "to pay out")
//   scope=all       every bill with a payer, any status, paid and unpaid; the
//                   unpaid total/count (used for the QR) stay unpaid-only and
//                   the paid part is reported next to them.
// Payers come from the bills themselves, so someone since removed from the
// event's payer list (`attached: false`) still shows as long as they are owed.
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
        lastBankChange: last ? { at: last.createdAt, byName: last.changedByUser.displayName } : null,
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
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));

  return NextResponse.json(result);
}
