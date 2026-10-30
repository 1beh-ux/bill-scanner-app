import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { billsBucket } from "@/lib/gcs";
import { personalGuard, savePersonalBill } from "@/lib/personal-bills-server";

// One personal bill: PATCH replaces it (not once a share is settled), DELETE removes it with its file.
const own = (eventId: string, billId: string) => prisma.personalBill.findFirst({ where: { id: billId, eventId }, include: { shares: { select: { settledAt: true, creditorPaidAt: true } } } });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; billId: string }> }) {
  const { id, billId } = await params;
  const g = await personalGuard(id);
  if ("error" in g) return g.error;
  if (g.event.status === "closed") return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  if (!(await own(id, billId))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const r = await savePersonalBill(g.event, g.user.id, billId, (await req.json().catch(() => ({}))) as Record<string, unknown>);
  return "error" in r ? NextResponse.json(r, { status: r.error === "not_found" ? 404 : r.error === "settled_locked" ? 409 : 400 }) : NextResponse.json(r);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; billId: string }> }) {
  const { id, billId } = await params;
  const g = await personalGuard(id);
  if ("error" in g) return g.error;
  if (g.event.status === "closed") return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  const bill = await own(id, billId);
  if (!bill) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (bill.shares.some((s) => s.settledAt || s.creditorPaidAt)) return NextResponse.json({ error: "settled_locked" }, { status: 409 });
  await prisma.personalBill.delete({ where: { id: billId } });
  if (bill.gcsObjectPath) await billsBucket.file(bill.gcsObjectPath).delete().catch(() => {});
  return NextResponse.json({ ok: true });
}
