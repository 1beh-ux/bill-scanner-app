import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { approveBill } from "@/lib/bill-actions";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
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

  if (bill.event.status === "closed") {
    return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.bill.update({
      where: { id },
      data: {
        status: "new",
        approvedAt: null,
        approvedByUserId: null,
      },
    });
    await tx.billAuditLog.create({
      data: {
        billId: id,
        userId: user.id,
        actionType: "reopen",
      },
    });
    return result;
  });

  return NextResponse.json(updated);
}