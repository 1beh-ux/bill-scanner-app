import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { approveBill, reopenBill } from "@/lib/bill-actions";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const bill = await prisma.bill.findUnique({ where: { id }, select: { eventId: true } });
  if (!bill) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireModuleAccess(user, bill.eventId, "bills");
  if (denied) return denied;

  const result = await approveBill(id, user.id);

  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "already_approved" ||
            result.error === "event_closed_locked"
          ? 409
          : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const bill = await prisma.bill.findUnique({
    where: { id },
    include: { event: { select: { status: true } } },
  });

  if (!bill) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const denied = await requireModuleAccess(user, bill.eventId, "bills");
  if (denied) return denied;

  const r = await reopenBill(id, user.id);
  // Already open: nothing to do (same as before -- the call just returns the bill).
  if (!r.ok && r.error !== "not_approved") return NextResponse.json({ error: r.error }, { status: r.error === "not_found" ? 404 : 409 });
  return NextResponse.json(await prisma.bill.findUnique({ where: { id } }));
}