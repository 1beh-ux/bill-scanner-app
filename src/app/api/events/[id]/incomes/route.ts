import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { hasBankAccess } from "@/lib/bank/guard";

// Rozpočet -> Příjmy (EventIncome): the event's income lines, planned and real. Bills module.
// GET also gives, to people with Banka access, the bank's income per type as a hint for "Skutečnost".
type Ctx = { params: Promise<{ id: string }> };

async function guard(ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return { denied: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const { id: eventId } = await ctx.params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return { denied };
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { status: true } });
  return { user, eventId, closed: event.status === "closed" };
}

const amount = (v: unknown) => {
  if (v === null || v === "" || v === undefined) return null;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? new Prisma.Decimal(n.toFixed(2)) : undefined;
};
const shape = (r: { id: string; name: string; plannedCzk: Prisma.Decimal | null; actualCzk: Prisma.Decimal | null; note: string | null }) => ({
  id: r.id, name: r.name, plannedCzk: r.plannedCzk === null ? null : Number(r.plannedCzk), actualCzk: r.actualCzk === null ? null : Number(r.actualCzk), note: r.note,
});

export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard(ctx);
  if ("denied" in g) return g.denied;
  const rows = await prisma.eventIncome.findMany({ where: { eventId: g.eventId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const bank = (await hasBankAccess(g.user, g.eventId))
    ? (await prisma.bankTransaction.groupBy({ by: ["incomeType"], where: { eventId: g.eventId, classification: "income", currency: "CZK", amount: { gt: 0 } }, _sum: { amount: true } }))
        // BK5 (audit2): an income nobody sorted yet is "Neroztříděno", not mixed into "Ostatní"; listed last.
        .map((x) => ({ incomeType: x.incomeType ?? "unclassified", sum: Number(x._sum.amount ?? 0) }))
        .sort((a, b) => Number(a.incomeType === "unclassified") - Number(b.incomeType === "unclassified"))
    : null;
  return NextResponse.json({ rows: rows.map(shape), bank });
}

/** Create { name, plannedCzk?, actualCzk?, note? } or update with { id, ...same }. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("denied" in g) return g.denied;
  if (g.closed) return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  const b = await req.json().catch(() => ({}));
  const planned = amount(b.plannedCzk), actual = amount(b.actualCzk);
  if (planned === undefined || actual === undefined) return NextResponse.json({ error: "bad_amount" }, { status: 400 });
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 120) : "";
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 300) || null : null;
  if (typeof b.id === "string") {
    const r = await prisma.eventIncome.updateMany({ where: { id: b.id, eventId: g.eventId }, data: { ...(name && { name }), plannedCzk: planned, actualCzk: actual, note } });
    return NextResponse.json({ updated: r.count });
  }
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
  const count = await prisma.eventIncome.count({ where: { eventId: g.eventId } });
  const r = await prisma.eventIncome.create({ data: { eventId: g.eventId, name, plannedCzk: planned, actualCzk: actual, note, sortOrder: count } });
  return NextResponse.json(shape(r), { status: 201 });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("denied" in g) return g.denied;
  if (g.closed) return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  await prisma.eventIncome.deleteMany({ where: { id: req.nextUrl.searchParams.get("incomeId") ?? "", eventId: g.eventId } });
  return NextResponse.json({ ok: true });
}
