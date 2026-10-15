import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";

// Rozpočet -> Zálohy: money the organization sent to the event (EventDeposit). Bills module.
type Ctx = { params: Promise<{ id: string }> };

async function guard(ctx: Ctx): Promise<{ denied: NextResponse } | { eventId: string; userId: string }> {
  const user = await getCurrentUser();
  if (!user) return { denied: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const { id: eventId } = await ctx.params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  return denied ? { denied } : { eventId, userId: user.id };
}

export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard(ctx);
  if ("denied" in g) return g.denied;
  const rows = await prisma.eventDeposit.findMany({ where: { eventId: g.eventId }, orderBy: { receivedAt: "asc" } });
  return NextResponse.json(rows.map((d) => ({ id: d.id, amountCzk: d.amountCzk.toString(), receivedAt: d.receivedAt, note: d.note })));
}

/** { amountCzk, receivedAt: "YYYY-MM-DD", note? } */
export async function POST(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("denied" in g) return g.denied;
  const body = await req.json().catch(() => ({}));
  const amount = Number(String(body.amountCzk ?? "").replace(/\s/g, "").replace(",", "."));
  const date = typeof body.receivedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.receivedAt) ? new Date(body.receivedAt) : null;
  if (!Number.isFinite(amount) || amount <= 0 || !date || isNaN(date.getTime())) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const event = await prisma.event.findUniqueOrThrow({ where: { id: g.eventId }, select: { status: true } });
  if (event.status === "closed") return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;
  const d = await prisma.eventDeposit.create({ data: { eventId: g.eventId, amountCzk: new Prisma.Decimal(amount.toFixed(2)), receivedAt: date, note, createdByUserId: g.userId } });
  return NextResponse.json({ id: d.id }, { status: 201 });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("denied" in g) return g.denied;
  const id = req.nextUrl.searchParams.get("depositId") ?? "";
  const event = await prisma.event.findUniqueOrThrow({ where: { id: g.eventId }, select: { status: true } });
  if (event.status === "closed") return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  await prisma.eventDeposit.deleteMany({ where: { id, eventId: g.eventId } });
  return NextResponse.json({ ok: true });
}
