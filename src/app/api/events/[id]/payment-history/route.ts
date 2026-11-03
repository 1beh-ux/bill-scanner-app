import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { effectiveAmountCzk } from "@/lib/bill-amount";
import { PAYOUT_PAYER_WHERE } from "@/lib/payout";
import { evenSplit } from "@/lib/personal-bills";

// Platby -> "Historie plateb" (2026-11-03): what has already been paid and settled -- official bills paid out,
// personal parts paid (to the event / person to person) and others' parts paid back to their authors -- with
// when and by whom (a user, or the bank / the person's link when nobody clicked).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;

  const [bills, shares, corrections] = await Promise.all([
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
        personalBill: { select: { authorId: true, viaEvent: true, merchantName: true, unitLabel: true, unitPrice: true, lineItems: true, author: { select: { canonicalName: true } } } },
      },
    }),
    prisma.paymentCorrection.findMany({ where: { eventId }, orderBy: { createdAt: "desc" } }),
  ]);
  const users_ = (id: string) => users.get(id) ?? null;
  const users = new Map((await prisma.user.findMany({ where: { id: { in: [...shares.map((s) => s.settledByUserId), ...corrections.map((c) => c.userId)].filter((x): x is string => !!x) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));

  // lines: the receipt lines / tally pieces behind a personal part (what exactly was paid); note: a cancellation's reason.
  type Line = { description: string; share: number; people: number; total: number };
  type Item = { at: string | null; personId: string; person: string; kind: "payout" | "paid" | "paidBack" | "direct" | "voided"; title: string; amountCzk: number; by: string | null; counterpart: string | null; lines?: Line[]; quantity?: number | null; unitPrice?: number | null; note?: string; paidAt?: string | null };
  const linesOf = (lineItems: unknown, authorId: string): Line[] =>
    (Array.isArray(lineItems) ? (lineItems as { description?: string; total?: number; assign?: string[] }[]) : [])
      .filter((l) => l.assign?.includes(`a:${authorId}`) && l.total && l.total > 0)
      .map((l) => ({ description: l.description ?? "", total: l.total!, people: l.assign!.length, share: evenSplit(l.total!, l.assign!.length)[l.assign!.indexOf(`a:${authorId}`)] ?? 0 }));
  const names = new Map((await prisma.author.findMany({ where: { id: { in: corrections.map((c) => c.authorId) } }, select: { id: true, canonicalName: true } })).map((a) => [a.id, a.canonicalName]));
  const items: Item[] = corrections.map((c) => ({ at: c.createdAt.toISOString(), personId: c.authorId, person: names.get(c.authorId) ?? "?", kind: "voided", title: c.title, amountCzk: Number(c.amountCzk), by: c.userId ? users_(c.userId) : null, counterpart: null, note: c.note, paidAt: c.paidAt?.toISOString() ?? null }));
  for (const b of bills)
    items.push({ at: b.paidAt?.toISOString() ?? null, personId: b.payerAuthorId!, person: b.payerAuthor!.canonicalName, kind: "payout", title: b.merchantName ?? "", amountCzk: Number(effectiveAmountCzk(b) ?? 0), by: b.paidBy?.displayName ?? null, counterpart: null });
  for (const s of shares) {
    const pb = s.personalBill;
    const title = [pb.unitLabel ?? pb.merchantName, s.quantity != null ? `${Number(s.quantity)}×` : null].filter(Boolean).join(" ");
    const self = pb.authorId === s.authorId;
    const detail = { lines: linesOf(pb.lineItems, s.authorId), quantity: s.quantity == null ? null : Number(s.quantity), unitPrice: pb.unitPrice == null ? null : Number(pb.unitPrice) };
    if (s.settledAt && !self)
      items.push({ at: s.settledAt.toISOString(), personId: s.authorId, person: s.author.canonicalName, kind: pb.viaEvent || !pb.authorId ? "paid" : "direct", title, amountCzk: Number(s.amountCzk), by: s.settledByUserId ? users.get(s.settledByUserId) ?? null : null, counterpart: pb.viaEvent || !pb.authorId ? null : pb.author?.canonicalName ?? null, ...detail });
    if (s.creditorPaidAt && pb.authorId && !self)
      items.push({ at: s.creditorPaidAt.toISOString(), personId: pb.authorId, person: pb.author?.canonicalName ?? "?", kind: "paidBack", title, amountCzk: Number(s.amountCzk), by: null, counterpart: s.author.canonicalName, ...detail });
  }
  items.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  return NextResponse.json(items);
}
