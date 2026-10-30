import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { PAYOUT_PAYER_WHERE } from "@/lib/payout";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const authorId: string | undefined = body.authorId;
  const action: "pay" | "unpay" = body.action === "unpay" ? "unpay" : "pay";
  if (!authorId) {
    return NextResponse.json({ error: "authorId is required" }, { status: 400 });
  }

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (event.status === "closed") {
    return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  }

const scope: "approved" | "all" = body.scope === "all" ? "all" : "approved";

  const result = await prisma.bill.updateMany({
    where: {
      eventId,
      payerAuthorId: authorId,
      payerAuthor: PAYOUT_PAYER_WHERE,
      ...(scope === "approved" ? { status: "approved" } : {}),
      paidToAuthor: action === "pay" ? false : true,
    },
    data:
      action === "pay"
        ? { paidToAuthor: true, paidAt: new Date(), paidByUserId: user.id }
        : { paidToAuthor: false, paidAt: null, paidByUserId: null },
  });

  // Osobní účtenky: the payout is netted with the personal bills through the event -- settled together: the
  // person's own parts (they paid the event) and the others' parts of bills they paid (the event paid them).
  const pay = action === "pay";
  const [own, theirs] = await prisma.$transaction([
    prisma.personalBillShare.updateMany({
      where: { authorId, personalBill: { eventId, OR: [{ viaEvent: true }, { authorId: null }] }, settledAt: pay ? null : { not: null } },
      data: pay ? { settledAt: new Date(), settledByUserId: user.id } : { settledAt: null, settledByUserId: null },
    }),
    prisma.personalBillShare.updateMany({
      where: { authorId: { not: authorId }, personalBill: { eventId, viaEvent: true, authorId }, creditorPaidAt: pay ? null : { not: null } },
      data: { creditorPaidAt: pay ? new Date() : null },
    }),
  ]);
  const shares = { count: own.count + theirs.count };

  return NextResponse.json({ updated: result.count, personal: shares.count });
}