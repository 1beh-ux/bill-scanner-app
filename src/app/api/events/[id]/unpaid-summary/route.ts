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

  const bills = await prisma.bill.findMany({
    where: {
      eventId,
      status: "approved",
      paidToAuthor: false,
      payerAuthorId: { not: null },
    },
    include: { payerAuthor: true },
  });

const byAuthor = new Map<string, { authorId: string; name: string; bankAccountNumber: string | null; bankCode: string | null; total: Prisma.Decimal; count: number }>();

  for (const bill of bills) {
    if (!bill.payerAuthorId || !bill.payerAuthor) continue;
    const entry = byAuthor.get(bill.payerAuthorId) ?? {
      authorId: bill.payerAuthorId,
      name: bill.payerAuthor.canonicalName,
      bankAccountNumber: bill.payerAuthor.bankAccountNumber,
      bankCode: bill.payerAuthor.bankCode,
      total: new Prisma.Decimal(0),
      count: 0,
    };
    if (bill.amountCzk !== null) {
      entry.total = entry.total.plus(bill.amountCzk);
    }
    entry.count += 1;
    byAuthor.set(bill.payerAuthorId, entry);
  }

  const result = Array.from(byAuthor.values())
    .map((e) => ({
      authorId: e.authorId,
      name: e.name,
      bankAccountNumber: e.bankAccountNumber,
      bankCode: e.bankCode,
      unpaidTotalCzk: e.total.toString(),
      unpaidBillCount: e.count,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));

  return NextResponse.json(result);
}