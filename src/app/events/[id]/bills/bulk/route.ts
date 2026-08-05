import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { approveBill, deleteBill } from "@/lib/bill-actions";

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

  if (!["approve", "delete"].includes(action)) {
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }

  if (billIds.length === 0) {
    return NextResponse.json({ error: "no_bills_selected" }, { status: 400 });
  }

  // Only operate on bills that actually belong to this event.
  const bills = await prisma.bill.findMany({
    where: { id: { in: billIds }, eventId },
    select: { id: true, originalFilename: true },
  });

  const nameById = new Map(bills.map((b) => [b.id, b.originalFilename]));
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