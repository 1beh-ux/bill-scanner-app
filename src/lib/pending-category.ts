import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

/**
 * If this bill has a category chosen at import time (before an amount was
 * known) and doesn't already have any category splits, applies it now as a
 * single full-amount split, then clears the pending selection. Safe to call
 * whenever a bill's total amount is set or changed — a no-op if there's
 * nothing pending or splits already exist.
 */
export async function applyPendingCategoryIfNeeded(
  billId: string,
  totalAmount: Prisma.Decimal | null,
  amountCzk: Prisma.Decimal | null
): Promise<void> {
  if (totalAmount === null) return;

  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    select: { pendingCategoryId: true, categories: { select: { id: true } } },
  });
  if (!bill || !bill.pendingCategoryId || bill.categories.length > 0) return;

  await prisma.$transaction([
    prisma.billCategory.create({
      data: {
        billId,
        eventCategoryId: bill.pendingCategoryId,
        amount: totalAmount,
        amountCzk,
      },
    }),
    prisma.bill.update({ where: { id: billId }, data: { pendingCategoryId: null } }),
  ]);
}