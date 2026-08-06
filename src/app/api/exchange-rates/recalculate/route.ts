import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { convertToCzk } from "@/lib/exchange-rates";

export const maxDuration = 300;

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Approved bills are deliberately excluded: their stored rate is denormalized
  // so historical records don't shift when rates are added or corrected later.
  const candidates = await prisma.bill.findMany({
    where: {
      amountCzk: null,
      totalAmount: { not: null },
      billDate: { not: null },
      status: { not: "approved" },
    },
    select: {
      id: true,
      totalAmount: true,
      currency: true,
      billDate: true,
    },
  });

  let converted = 0;
  const stillMissing: string[] = [];

  for (const bill of candidates) {
    const conv = await convertToCzk(bill.totalAmount!, bill.currency, bill.billDate!);

    if (!conv) {
      stillMissing.push(bill.id);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.bill.update({
        where: { id: bill.id },
        data: {
          amountCzk: conv.amountCzk,
          exchangeRateUsed: conv.rateUsed,
          exchangeRateDate: conv.rateDate,
        },
      });

      const cats = await tx.billCategory.findMany({ where: { billId: bill.id } });
      for (const cat of cats) {
        await tx.billCategory.update({
          where: { id: cat.id },
          data: {
            amountCzk: new Prisma.Decimal(cat.amount)
              .times(conv.rateUsed)
              .toDecimalPlaces(2),
          },
        });
      }
    });

    converted++;
  }

  return NextResponse.json({
    ok: true,
    checked: candidates.length,
    converted,
    stillMissing: stillMissing.length,
  });
}