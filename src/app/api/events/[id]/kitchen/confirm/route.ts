import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { kitchenGuard, isIsoDay } from "@/lib/kitchen/server";
import { snapshotEntries } from "@/lib/kitchen/snapshot";

// POST { date } "Potvrdit den": the day's drafts get their snapshot. { date, reopen: true } "Znovu otevřít":
// back to drafts (live quantities again); cooked entries (with feedback) stay as they are.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!isIsoDay(b.date)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const date = new Date(`${b.date}T00:00:00Z`);
  if (b.reopen === true) {
    const r = await prisma.planEntry.updateMany({ where: { eventId: id, date, status: "confirmed" }, data: { status: "draft", recipeSnapshot: Prisma.DbNull } });
    return NextResponse.json({ reopened: r.count });
  }
  const drafts = await prisma.planEntry.findMany({ where: { eventId: id, date, status: "draft" }, select: { id: true } });
  return NextResponse.json({ confirmed: await snapshotEntries(g.event, drafts.map((d) => d.id)) });
}
