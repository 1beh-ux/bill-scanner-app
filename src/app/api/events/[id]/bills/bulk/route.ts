import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { approveBill, deleteBill } from "@/lib/bill-actions";
import { moveBillToEvent } from "@/lib/bill-move";

interface FailureDetail {
  billId: string;
  filename: string;
  error: string;
  missing?: string[];
  splitTotal?: string;
  billTotal?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: eventId } = await params;
  const body = await req.json();
  const action: string = body.action;
  const billIds: string[] = body.billIds || [];

  if (!["approve", "delete", "mark_paid", "mark_unpaid", "move"].includes(action)) {
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }
  if (billIds.length === 0) {
    return NextResponse.json({ error: "no_bills_selected" }, { status: 400 });
  }

  // Only operate on bills that actually belong to this event.
  const bills = await prisma.bill.findMany({
    where: { id: { in: billIds }, eventId },
    select: { id: true, originalFilename: true, payerAuthorId: true },
  });
  const nameById = new Map(bills.map((b) => [b.id, b.originalFilename]));

if (action === "move") {
    const targetEventId: string | undefined = body.targetEventId;
    if (!targetEventId) {
      return NextResponse.json({ error: "target_event_id_required" }, { status: 400 });
    }
    const succeeded: string[] = [];
    const failed: FailureDetail[] = [];
    for (const bill of bills) {
      const result = await moveBillToEvent(bill.id, targetEventId, user.id);
      if (result.ok) {
        succeeded.push(bill.id);
      } else {
        failed.push({ billId: bill.id, filename: nameById.get(bill.id) || bill.id, error: result.error || "unknown" });
      }
    }
    return NextResponse.json({
      action,
      succeededCount: succeeded.length,
      failedCount: failed.length,
      succeeded,
      failed,
    });
  }

  if (action === "mark_paid" || action === "mark_unpaid") {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (event?.status === "closed") {
      return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
    }

    // "Paid by event" bills (no payer) have nothing to reimburse — skip
    // them rather than erroring, since selecting a mixed batch is normal.
    const eligible = bills.filter((b) => b.payerAuthorId !== null);
    const skipped = bills.filter((b) => b.payerAuthorId === null);

    const result = await prisma.bill.updateMany({
      where: { id: { in: eligible.map((b) => b.id) } },
      data:
        action === "mark_paid"
          ? { paidToAuthor: true, paidAt: new Date(), paidByUserId: user.id }
          : { paidToAuthor: false, paidAt: null, paidByUserId: null },
    });

    return NextResponse.json({
      action,
      succeededCount: result.count,
      failedCount: skipped.length,
      succeeded: eligible.map((b) => b.id),
      failed: skipped.map((b) => ({
        billId: b.id,
        filename: nameById.get(b.id) || b.id,
        error: "no_payer",
      })),
    });
  }

  const succeeded: string[] = [];
  const failed: FailureDetail[] = [];

  for (const bill of bills) {
    if (action === "delete") {
      const result = await deleteBill(bill.id);
      if (result.ok) {
        succeeded.push(bill.id);
      } else {
        failed.push({
          billId: bill.id,
          filename: nameById.get(bill.id) || bill.id,
          error: result.error || "unknown",
        });
      }
      continue;
    }

    const result = await approveBill(bill.id, user.id);
    if (result.ok) {
      succeeded.push(bill.id);
    } else {
      failed.push({
        billId: bill.id,
        filename: nameById.get(bill.id) || bill.id,
        error: result.error,
        missing: result.missing,
        splitTotal: result.splitTotal,
        billTotal: result.billTotal,
      });
    }
  }

  return NextResponse.json({
    action,
    succeededCount: succeeded.length,
    failedCount: failed.length,
    succeeded,
    failed,
  });
}