import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { personalGuard } from "@/lib/personal-bills-server";

// Person to person (bills whose author isn't the treasurer): POST { debtorId, creditorId, action: settle | unsettle }
// marks every open share between the two -- both directions, as Platby nets them -- settled (or open again).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await personalGuard(id);
  if ("error" in g) return g.error;
  if (g.event.status === "closed") return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  const b = (await req.json().catch(() => ({}))) as { debtorId?: unknown; creditorId?: unknown; action?: unknown };
  if (typeof b.debtorId !== "string" || typeof b.creditorId !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const settle = b.action !== "unsettle";
  const r = await prisma.personalBillShare.updateMany({
    where: {
      personalBill: { eventId: id },
      settledAt: settle ? null : { not: null },
      OR: [
        { authorId: b.debtorId, personalBill: { authorId: b.creditorId, viaEvent: false } },
        { authorId: b.creditorId, personalBill: { authorId: b.debtorId, viaEvent: false } },
      ],
    },
    data: settle ? { settledAt: new Date(), settledByUserId: g.user.id } : { settledAt: null, settledByUserId: null },
  });
  return NextResponse.json({ updated: r.count });
}
