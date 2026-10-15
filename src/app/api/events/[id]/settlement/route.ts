import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { computeSettlement } from "@/lib/settlement";
import { effectiveAmountCzk } from "@/lib/bill-amount";
import { officialAccountOf } from "@/lib/official-account";

// Rozpočet -> Vyúčtování s organizací (src/lib/settlement.ts). Live, like the budget table: every
// bill whatever its status (?approved=1: approved only, as in the manifest's Souhrn sheet).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;
  const approvedOnly = req.nextUrl.searchParams.get("approved") === "1";
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true, organizationId: true } });
  const [categories, bills, deposits, official] = await Promise.all([
    prisma.eventCategory.findMany({ where: { eventId }, orderBy: { name: "asc" } }),
    prisma.bill.findMany({
      where: { eventId, ...(approvedOnly && { status: "approved" }) },
      select: { status: true, amountCzk: true, totalAmount: true, currency: true, payerAuthor: { select: { isOfficialAccount: true } }, categories: { select: { eventCategoryId: true, amountCzk: true } } },
    }),
    prisma.eventDeposit.findMany({ where: { eventId } }),
    officialAccountOf(eventId, event.organizationId),
  ]);
  const settlement = computeSettlement({
    categories: categories.map((c) => ({ id: c.id, name: c.name, budget: c.budgetAmount })),
    bills: bills.map((b) => ({ amountCzk: effectiveAmountCzk(b), payerAuthor: b.payerAuthor, categories: b.categories })),
    deposits,
  });
  return NextResponse.json({ ...settlement, eventName: event.name, notApproved: bills.filter((b) => b.status !== "approved").length, official });
}
