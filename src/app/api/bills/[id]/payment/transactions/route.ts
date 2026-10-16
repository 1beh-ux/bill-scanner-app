import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBillAccess } from "@/lib/bank/bill-access";
import { hasBankAccess } from "@/lib/bank/guard";

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
    include: { matches: { where: { confirmedAt: { not: null } }, select: { amountCzk: true } } },
    take: 2000,
  });
  const target = Number(a.bill.amountCzk ?? 0);
  return NextResponse.json(
    txs
      .map((t) => ({ id: t.id, bookingDate: t.bookingDate, amount: Number(t.amount), counterpartyName: t.counterpartyName, message: t.message, remaining: Math.abs(Number(t.amount)) - t.matches.reduce((s, m) => s + Number(m.amountCzk), 0) }))
      .filter((t) => t.remaining > 0.005)
      .sort((x, y) => Math.abs(x.remaining - target) - Math.abs(y.remaining - target))
      .slice(0, 30)
  );
}
