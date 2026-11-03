import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { effectiveAmountCzk } from "@/lib/bill-amount";
import { PAYOUT_PAYER_WHERE } from "@/lib/payout";

// Platby -> "Historie plateb" (2026-11-03): what has already been paid and settled -- official bills paid out,
// personal parts paid (to the event / person to person) and others' parts paid back to their authors -- with
// when and by whom (a user, or the bank / the person's link when nobody clicked).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;

  const [bills, shares] = await Promise.all([
    prisma.bill.findMany({
      where: { eventId, paidToAuthor: true, payerAuthorId: { not: null }, payerAuthor: PAYOUT_PAYER_WHERE },
      select: { merchantName: true, billDate: true, amountCzk: true, totalAmount: true, currency: true, paidAt: true, payerAuthorId: true, payerAuthor: { select: { canonicalName: true } }, paidBy: { select: { displayName: true } } },
    }),
    prisma.personalBillShare.findMany({
      where: { personalBill: { eventId }, OR: [{ settledAt: { not: null } }, { creditorPaidAt: { not: null } }] },
      select: {
        authorId: true,
        amountCzk: true,
        quantity: true,
        settledAt: true,
        settledByUserId: true,
        creditorPaidAt: true,
        author: { select: { canonicalName: true } },
        personalBill: { select: { authorId: true, viaEvent: true, merchantName: true, unitLabel: true, author: { select: { canonicalName: true } } } },
      },
    }),
  ]);
  const users = new Map((await prisma.user.findMany({ where: { id: { in: shares.map((s) => s.settledByUserId).filter((x): x is string => !!x) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));

  type Item = { at: string | null; personId: string; person: string; kind: "payout" | "paid" | "paidBack" | "direct"; title: string; amountCzk: number; by: string | null; counterpart: string | null };
  const items: Item[] = [];
  for (const b of bills)
    items.push({ at: b.paidAt?.toISOString() ?? null, personId: b.payerAuthorId!, person: b.payerAuthor!.canonicalName, kind: "payout", title: b.merchantName ?? "", amountCzk: Number(effectiveAmountCzk(b) ?? 0), by: b.paidBy?.displayName ?? null, counterpart: null });
  for (const s of shares) {
    const pb = s.personalBill;
    const title = [pb.unitLabel ?? pb.merchantName, s.quantity != null ? `${Number(s.quantity)}×` : null].filter(Boolean).join(" ");
    const self = pb.authorId === s.authorId;
    if (s.settledAt && !self)
      items.push({ at: s.settledAt.toISOString(), personId: s.authorId, person: s.author.canonicalName, kind: pb.viaEvent || !pb.authorId ? "paid" : "direct", title, amountCzk: Number(s.amountCzk), by: s.settledByUserId ? users.get(s.settledByUserId) ?? null : null, counterpart: pb.viaEvent || !pb.authorId ? null : pb.author?.canonicalName ?? null });
    if (s.creditorPaidAt && pb.authorId && !self)
      items.push({ at: s.creditorPaidAt.toISOString(), personId: pb.authorId, person: pb.author?.canonicalName ?? "?", kind: "paidBack", title, amountCzk: Number(s.amountCzk), by: null, counterpart: s.author.canonicalName });
  }
  items.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  return NextResponse.json(items);
}
