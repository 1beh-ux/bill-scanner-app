import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBank } from "@/lib/bank/guard";
import { hasModuleAccess } from "@/lib/module-access";
import { moveBillToEvent } from "@/lib/bill-move";

// Párování -> "i jiné akce" -> Přesunout sem: the bill moves into this event (the existing bill move,
// with its checks: Účtenky access in both events, not approved / processing / bank-paired there).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; txId: string }> }) {
  const { id } = await params;
  const ctx = await requireBank(id);
  if ("error" in ctx) return ctx.error;
  const body = await req.json().catch(() => ({}));
  const bill = typeof body.billId === "string" ? await prisma.bill.findUnique({ where: { id: body.billId }, select: { id: true, eventId: true } }) : null;
  if (!bill) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await hasModuleAccess(ctx.user, bill.eventId, "bills"))) return NextResponse.json({ error: "module_access_denied" }, { status: 403 });
  const r = await moveBillToEvent(bill.id, id, ctx.user);
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
