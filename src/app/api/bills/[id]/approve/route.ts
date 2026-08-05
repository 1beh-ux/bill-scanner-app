import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

function slug(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "");
}

export async function POST(
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
      event: { select: { name: true, status: true } },
    },
  });

  if (!bill) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (bill.status === "approved") {
    return NextResponse.json({ error: "already_approved" }, { status: 409 });
  }

  if (bill.event.status === "closed") {
    return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  }

  const missing: string[] = [];
  if (bill.totalAmount === null) missing.push("totalAmount");
  if (bill.billDate === null) missing.push("billDate");
  if (bill.categories.length === 0) missing.push("categories");

  if (missing.length > 0) {
    return NextResponse.json({ error: "missing_fields", missing }, { status: 400 });
  }

  const splitTotal = bill.categories.reduce(
    (sum, c) => sum.plus(new Prisma.Decimal(c.amount)),
    new Prisma.Decimal(0)
  );

  if (!splitTotal.equals(new Prisma.Decimal(bill.totalAmount!))) {
    return NextResponse.json(
      {
        error: "split_mismatch",
        splitTotal: splitTotal.toFixed(2),
        billTotal: new Prisma.Decimal(bill.totalAmount!).toFixed(2),
      },
      { status: 400 }
    );
  }

  const sorted = [...bill.categories].sort((a, b) =>
    new Prisma.Decimal(b.amount).comparedTo(new Prisma.Decimal(a.amount))
  );
  const primaryCategory = sorted[0].eventCategory.name;
  const categoryLabel =
    bill.categories.length > 1
      ? `${slug(primaryCategory)}+${bill.categories.length - 1}`
      : slug(primaryCategory);

  const datePart = bill.billDate!.toISOString().slice(0, 10);
  const amountPart = new Prisma.Decimal(bill.totalAmount!).toFixed(2).replace(".", "-");
  const displayFilename = `${datePart}_${categoryLabel}_${amountPart}_${slug(bill.event.name)}`;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.bill.update({
      where: { id },
      data: {
        status: "approved",
        approvedAt: new Date(),
        approvedByUserId: user.id,
        displayFilename,
      },
    });
    await tx.billAuditLog.create({
      data: {
        billId: id,
        userId: user.id,
        actionType: "approve",
      },
    });
    return result;
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
