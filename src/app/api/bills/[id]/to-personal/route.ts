import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";

// "Přesunout do osobních" (Osobní účtenky, 2026-10-30): an official bill that was a private purchase for people
// leaves the official bills (lists, export, Rozpočet, settlement) and becomes a personal bill to split. Same locks
// as deleting a bill; not once paid out. Its author = the payer (else the event's treasurer).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const bill = await prisma.bill.findUnique({ where: { id }, include: { event: { select: { status: true, treasurerAuthorId: true } } } });
  if (!bill) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const denied = await requireModuleAccess(user, bill.eventId, "bills");
  if (denied) return denied;
  if (bill.ingestChannel === "travel_order") return NextResponse.json({ error: "travel_order_locked" }, { status: 409 });
  if (bill.status === "approved") return NextResponse.json({ error: "bill_approved_locked" }, { status: 409 });
  if (bill.status === "queued" || bill.status === "processing") return NextResponse.json({ error: "bill_processing_locked" }, { status: 409 });
  if (bill.event.status === "closed") return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  if (bill.paidToAuthor || bill.exportedAt) return NextResponse.json({ error: "bill_paid_locked" }, { status: 409 });
  const authorId = bill.payerAuthorId ?? bill.event.treasurerAuthorId;
  if (!authorId) return NextResponse.json({ error: "author_required" }, { status: 400 });
  const total = bill.totalAmount ?? bill.amountCzk;
  if (total == null) return NextResponse.json({ error: "amount_required" }, { status: 400 });

  const personal = await prisma.$transaction(async (tx) => {
    const p = await tx.personalBill.create({
      data: {
        eventId: bill.eventId,
        authorId,
        billDate: bill.billDate ?? bill.createdAt,
        merchantName: bill.merchantName,
        totalAmount: total,
        currency: bill.totalAmount ? bill.currency : "CZK",
        amountCzk: bill.amountCzk ?? (bill.currency === "CZK" ? bill.totalAmount : null),
        exchangeRateUsed: bill.exchangeRateUsed,
        note: bill.notes,
        gcsObjectPath: bill.gcsObjectPath,
        originalFilename: bill.originalFilename,
        sizeBytes: bill.sizeBytes,
        fromBill: {
          originalFilename: bill.originalFilename,
          displayFilename: bill.displayFilename,
          contentHash: bill.contentHash,
          ingestChannel: bill.ingestChannel,
          driveSourceFileId: bill.driveSourceFileId,
          originalGcsObjectPath: bill.originalGcsObjectPath,
          notes: bill.notes,
          createdByUserId: bill.createdByUserId,
        },
        createdByUserId: user.id,
      },
      select: { id: true },
    });
    // As the bill's DELETE: its categories and audit go; bank pairings / duplicate dismissals cascade.
    await tx.billCategory.deleteMany({ where: { billId: id } });
    await tx.billAuditLog.deleteMany({ where: { billId: id } });
    await tx.bill.delete({ where: { id } });
    return p;
  });
  return NextResponse.json(personal);
}
