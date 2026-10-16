import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBillAccess } from "@/lib/bank/bill-access";
import { hasBankAccess } from "@/lib/bank/guard";
import { billValueIn } from "@/lib/bank/currency";

// Bill detail -> "Spárovat s platbou" (Banka users only): the event's outgoing payments not fully
// paired, closest amount first; the pairing itself goes through Banka's pairing route.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireBillAccess((await params).id);
  if ("error" in a) return a.error;
  if (!(await hasBankAccess(a.user, a.bill.eventId))) return NextResponse.json({ error: "module_access_denied" }, { status: 403 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const txs = await prisma.bankTransaction.findMany({
    where: {
      eventId: a.bill.eventId,
      amount: { lt: 0 },
      ...(q && { OR: [{ counterpartyName: { contains: q, mode: "insensitive" } }, { message: { contains: q, mode: "insensitive" } }, { vs: { contains: q } }] }),
    },
    include: { matches: { where: { confirmedAt: { not: null } }, select: { amountCzk: true, amountTx: true } } },
    take: 2000,
  });
  // Closest first, compared in each payment's currency (the bill's amount in it, else Kč).
  const bill = { currency: a.bill.currency, totalAmount: a.bill.totalAmount === null ? null : Number(a.bill.totalAmount), amountCzk: a.bill.amountCzk === null ? null : Number(a.bill.amountCzk) };
  const distance = (t: { currency: string; remaining: number }) => {
    const v = billValueIn(bill, t.currency);
    return v === null ? Number.MAX_SAFE_INTEGER : Math.abs(t.remaining - v);
  };
  return NextResponse.json(
    txs
      .map((t) => ({ id: t.id, bookingDate: t.bookingDate, amount: Number(t.amount), currency: t.currency, counterpartyName: t.counterpartyName, message: t.message, remaining: Math.abs(Number(t.amount)) - t.matches.reduce((s, m) => s + Number(m.amountTx ?? m.amountCzk), 0) }))
      .filter((t) => t.remaining > 0.005)
      .sort((x, y) => distance(x) - distance(y))
      .slice(0, 30)
  );
}
