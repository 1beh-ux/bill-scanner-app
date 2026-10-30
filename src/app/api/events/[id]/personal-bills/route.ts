import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pickablePeople, personalGuard, savePersonalBill } from "@/lib/personal-bills-server";
import { splitStatus } from "@/lib/personal-bills";

// Osobní účtenky (src/lib/personal-bills.ts): GET the event's personal bills, the people to pick and the
// treasurer; POST a new one (manual; a scan only prefills). Never part of the official bills or their export.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await personalGuard(id);
  if ("error" in g) return g.error;
  const [bills, people] = await Promise.all([
    prisma.personalBill.findMany({
      where: { eventId: id },
      include: { author: { select: { id: true, canonicalName: true } }, shares: { include: { author: { select: { id: true, canonicalName: true } } } } },
      orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
    }),
    pickablePeople(id),
  ]);
  return NextResponse.json({
    treasurerAuthorId: g.event.treasurerAuthorId,
    eventStatus: g.event.status,
    people,
    bills: bills.map((b) => {
      const shares = b.shares.map((s) => ({ authorId: s.authorId, name: s.author.canonicalName, amountCzk: Number(s.amountCzk), settled: !!s.settledAt }));
      return {
        id: b.id,
        billDate: b.billDate.toISOString().slice(0, 10),
        merchantName: b.merchantName,
        totalAmount: Number(b.totalAmount),
        currency: b.currency,
        amountCzk: b.amountCzk == null ? null : Number(b.amountCzk),
        splitMode: b.splitMode,
        note: b.note,
        hasFile: !!b.gcsObjectPath,
        fromBill: !!b.fromBill,
        author: { id: b.author.id, name: b.author.canonicalName },
        shares: shares.sort((x, y) => x.name.localeCompare(y.name, "cs")),
        status: b.amountCzk == null ? null : splitStatus(Number(b.amountCzk), shares.map((s) => s.amountCzk)),
      };
    }),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await personalGuard(id);
  if ("error" in g) return g.error;
  if (g.event.status === "closed") return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  const r = await savePersonalBill(g.event, g.user.id, null, (await req.json().catch(() => ({}))) as Record<string, unknown>);
  return "error" in r ? NextResponse.json(r, { status: r.error === "not_found" ? 404 : 400 }) : NextResponse.json(r, { status: 201 });
}
