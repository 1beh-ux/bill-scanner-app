import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { billsBucket } from "@/lib/gcs";

const AUDITED_FIELDS = [
  "merchantName",
  "billDate",
  "totalAmount",
  "currency",
  "payerAuthorId",
  "notes",
] as const;

function normalize(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export async function GET(
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
    include: {
      categories: { include: { eventCategory: true } },
      payerAuthor: true,
      event: { select: { id: true, name: true, status: true } },
    },
  });

  if (!bill) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(bill);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.bill.findUnique({
    where: { id },
    include: { event: { select: { status: true } } },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.status === "approved") {
    return NextResponse.json({ error: "bill_approved_locked" }, { status: 409 });
  }

  if (existing.event.status === "closed") {
    return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.merchantName !== undefined) data.merchantName = body.merchantName || null;
  if (body.billDate !== undefined) data.billDate = body.billDate ? new Date(body.billDate) : null;
  if (body.totalAmount !== undefined)
    data.totalAmount = body.totalAmount === "" || body.totalAmount === null ? null : body.totalAmount;
  if (body.currency !== undefined) data.currency = body.currency;
  if (body.payerAuthorId !== undefined) data.payerAuthorId = body.payerAuthorId || null;
  if (body.notes !== undefined) data.notes = body.notes || null;

  if (data.payerAuthorId !== undefined) {
    data.paidToAuthor = data.payerAuthorId === null;
  }

  if (existing.currency === "CZK" || data.currency === "CZK") {
    const amount = data.totalAmount !== undefined ? data.totalAmount : existing.totalAmount;
    data.amountCzk = amount;
  }

  // A manually edited bill moves out of "new" so it's distinguishable from
  // untouched uploads. Later AI statuses are left alone.
  if (existing.status === "new" && Object.keys(data).length > 0) {
    data.status = "to_review";
  }

  const auditEntries: {
    billId: string;
    userId: string;
    actionType: "edit";
    fieldName: string;
    oldValue: string | null;
    newValue: string | null;
  }[] = [];
  for (const field of AUDITED_FIELDS) {
    if (data[field] === undefined) continue;
    const oldValue = normalize(existing[field]);
    const newValue = normalize(data[field]);
    if (oldValue !== newValue) {
      auditEntries.push({
        billId: id,
        userId: user.id,
        actionType: "edit" as const,
        fieldName: field,
        oldValue,
        newValue,
      });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const bill = await tx.bill.update({ where: { id }, data });
    if (auditEntries.length > 0) {
      await tx.billAuditLog.createMany({ data: auditEntries });
    }
    return bill;
  });

  return NextResponse.json(updated);
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
  const bill = await prisma.bill.findUnique({ where: { id } });

  if (!bill) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.billCategory.deleteMany({ where: { billId: id } });
    await tx.billAuditLog.deleteMany({ where: { billId: id } });
    await tx.bill.delete({ where: { id } });
  });

  await billsBucket.file(bill.gcsObjectPath).delete().catch(() => {});

  return NextResponse.json({ ok: true });
}
