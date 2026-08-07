import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: eventId } = await params;

  const categories = await prisma.eventCategory.findMany({
    where: { eventId },
    orderBy: { name: "asc" },
  });

  // Includes bills of every status, not just approved — see conversation
  // note: this is meant as a live planning view, not a final ledger.
  const billCategories = await prisma.billCategory.findMany({
    where: { bill: { eventId } },
    select: { eventCategoryId: true, amountCzk: true },
  });

  const actualByCategory = new Map<string, { total: Prisma.Decimal; excluded: number }>();
  for (const bc of billCategories) {
    const entry = actualByCategory.get(bc.eventCategoryId) ?? { total: new Prisma.Decimal(0), excluded: 0 };
    if (bc.amountCzk !== null) {
      entry.total = entry.total.plus(bc.amountCzk);
    } else {
      entry.excluded += 1;
    }
    actualByCategory.set(bc.eventCategoryId, entry);
  }

  const result = categories.map((cat) => {
    const agg = actualByCategory.get(cat.id);
    return {
      id: cat.id,
      name: cat.name,
      budgetAmount: cat.budgetAmount.toString(),
      actualCzk: (agg?.total ?? new Prisma.Decimal(0)).toString(),
      excludedCount: agg?.excluded ?? 0,
    };
  });

  return NextResponse.json(result);
}