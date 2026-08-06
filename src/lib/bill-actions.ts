import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { billsBucket } from "@/lib/gcs";

function slug(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "");
}

export type ApproveResult =
  | { ok: true; billId: string; displayFilename: string }
  | {
      ok: false;
      billId: string;
      error: string;
      missing?: string[];
      splitTotal?: string;
      billTotal?: string;
    };

export async function approveBill(
  billId: string,
  userId: string
): Promise<ApproveResult> {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: {
      categories: { include: { eventCategory: true } },
      event: { select: { name: true, status: true } },
    },
  });

  if (!bill) {
    return { ok: false, billId, error: "not_found" };
  }
  if (bill.status === "approved") {
    return { ok: false, billId, error: "already_approved" };
  }
  if (bill.event.status === "closed") {
    return { ok: false, billId, error: "event_closed_locked" };
  }

  const missing: string[] = [];
  if (bill.totalAmount === null) missing.push("totalAmount");
  if (bill.billDate === null) missing.push("billDate");
  if (bill.categories.length === 0) missing.push("categories");
  if (bill.amountCzk === null) missing.push("amountCzk");

  if (missing.length > 0) {
    return { ok: false, billId, error: "missing_fields", missing };
  }

  const splitTotal = bill.categories.reduce(
    (sum, c) => sum.plus(new Prisma.Decimal(c.amount)),
    new Prisma.Decimal(0)
  );
  const billTotal = new Prisma.Decimal(bill.totalAmount!);

  if (!splitTotal.equals(billTotal)) {
    return {
      ok: false,
      billId,
      error: "split_mismatch",
      splitTotal: splitTotal.toFixed(2),
      billTotal: billTotal.toFixed(2),
    };
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
  const amountPart = billTotal.toFixed(2).replace(".", "-");
  const displayFilename = `${datePart}_${categoryLabel}_${amountPart}_${slug(
    bill.event.name
  )}`;

  await prisma.$transaction(async (tx) => {
    await tx.bill.update({
      where: { id: billId },
      data: {
        status: "approved",
        approvedAt: new Date(),
        approvedByUserId: userId,
        displayFilename,
      },
    });
    await tx.billAuditLog.create({
      data: { billId, userId, actionType: "approve" },
    });
  });

  return { ok: true, billId, displayFilename };
}

export async function deleteBill(
  billId: string
): Promise<{ ok: boolean; billId: string; error?: string }> {
  const bill = await prisma.bill.findUnique({ where: { id: billId } });

  if (!bill) {
    return { ok: false, billId, error: "not_found" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.billCategory.deleteMany({ where: { billId } });
    await tx.billAuditLog.deleteMany({ where: { billId } });
    await tx.bill.delete({ where: { id: billId } });
  });

  await billsBucket
    .file(bill.gcsObjectPath)
    .delete()
    .catch(() => {});

  return { ok: true, billId };
}