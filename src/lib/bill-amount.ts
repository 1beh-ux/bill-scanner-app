import { Prisma } from "@/generated/prisma";

/**
 * Bill.amountCzk should always be set on an approved bill (approveBill blocks
 * approval otherwise), but older bills approved before that check existed can
 * still have it null. For a CZK bill, totalAmount *is* the CZK amount, so
 * that's a safe fallback. For a foreign-currency bill with no stored rate,
 * there's no safe number to show -- caller should treat that as "excluded"
 * (see budget-summary's excludedCount pattern) rather than guess.
 */
export function effectiveAmountCzk(bill: {
  amountCzk: Prisma.Decimal | null;
  totalAmount: Prisma.Decimal | null;
  currency: string;
}): Prisma.Decimal | null {
  if (bill.amountCzk !== null) return bill.amountCzk;
  if (bill.currency === "CZK" && bill.totalAmount !== null) return bill.totalAmount;
  return null;
}
