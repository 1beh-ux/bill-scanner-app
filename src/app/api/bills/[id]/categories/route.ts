import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const bill = await prisma.bill.findUnique({
    where: { id },
    include: { event: { select: { status: true } } },
  });

  if (!bill) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (bill.status === "approved") {
    return NextResponse.json({ error: "bill_approved_locked" }, { status: 409 });
  }
  if (bill.event.status === "closed") {
    return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  }

  const body = await req.json();
  const splits: { eventCategoryId: string; amount: string }[] = body.splits || [];

  if (splits.length === 0) {
    await prisma.billCategory.deleteMany({ where: { billId: id } });
    return NextResponse.json({ ok: true, splits: [] });
  }

  const total = splits.reduce(
    (sum, s) => sum.plus(new Prisma.Decimal(s.amount || "0")),
    new Prisma.Decimal(0)
  );

  if (bill.totalAmount !== null) {
    const billTotal = new Prisma.Decimal(bill.totalAmount);
    if (!total.equals(billTotal)) {
      return NextResponse.json(
        {
          error: "split_mismatch",
          splitTotal: total.toFixed(2),
          billTotal: billTotal.toFixed(2),
          difference: billTotal.minus(total).toFixed(2),
        },
        { status: 400 }
      );
    }
  }

  // Splits are stored in the bill's original currency; the CZK column is
  // derived using the same rate already applied to the bill total.
  const rate = bill.exchangeRateUsed ? new Prisma.Decimal(bill.exchangeRateUsed) : null;

  const created = await prisma.$transaction(async (tx) => {
    await tx.billCategory.deleteMany({ where: { billId: id } });
    await tx.billCategory.createMany({
      data: splits.map((s) => ({
        billId: id,
        eventCategoryId: s.eventCategoryId,
        amount: new Prisma.Decimal(s.amount),
        amountCzk: rate
          ? new Prisma.Decimal(s.amount).times(rate).toDecimalPlaces(2)
          : null,
      })),
    });
    return tx.billCategory.findMany({
      where: { billId: id },
      include: { eventCategory: true },
    });
  });

  return NextResponse.json({ ok: true, splits: created });
}