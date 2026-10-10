import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireSuperAdmin } from "@/lib/org-scope";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  // Super-admin only (organizations step 2).
  const notSuperAdmin = requireSuperAdmin(user);
  if (notSuperAdmin) return notSuperAdmin;

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