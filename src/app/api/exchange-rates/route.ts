import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rates = await prisma.exchangeRate.findMany({
    orderBy: [{ rateDate: "desc" }, { currency: "asc" }],
    take: 400,
  });

  const missingCzk = await prisma.bill.count({
    where: {
      amountCzk: null,
      totalAmount: { not: null },
      status: { not: "approved" },
    },
  });

  return NextResponse.json({ rates, missingCzk });
}