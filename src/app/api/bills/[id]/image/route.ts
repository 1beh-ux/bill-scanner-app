import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { billsBucket } from "@/lib/gcs";

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
    include: { event: { select: { status: true } } },
  });

  if (!bill) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (bill.status === "approved") {
    return NextResponse.json({ error: "bill_approved_locked" }, { status: 409 });
  }
  if (bill.event.status === "closed") {
    return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  }
  if (bill.originalFilename.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "pdf_not_editable" }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentHash = crypto.createHash("sha256").update(buffer).digest("hex");

  // Preserve the untouched scan the first time this bill is edited.
  let originalPath = bill.originalGcsObjectPath;
  if (!originalPath) {
    originalPath = bill.gcsObjectPath.replace("/bills/", "/bills-originals/");
    await billsBucket.file(bill.gcsObjectPath).copy(billsBucket.file(originalPath));
  }

  // Write to a fresh path so cached copies of the previous version are never served.
  const newPath = `${bill.gcsObjectPath.split("#")[0]}#${Date.now()}.jpg`;
  await billsBucket.file(newPath).save(buffer, { contentType: "image/jpeg" });

  const previousPath = bill.gcsObjectPath;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.bill.update({
        where: { id },
        data: {
          gcsObjectPath: newPath,
          originalGcsObjectPath: originalPath,
          contentHash,
        },
      });
      await tx.billAuditLog.create({
        data: {
          billId: id,
          userId: user.id,
          actionType: "edit",
          fieldName: "image",
          oldValue: previousPath,
          newValue: newPath,
        },
      });
    });
  } catch (err) {
    await billsBucket.file(newPath).delete().catch(() => {});
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "duplicate_after_edit" }, { status: 409 });
    }
    throw err;
  }

  if (previousPath !== originalPath) {
    await billsBucket.file(previousPath).delete().catch(() => {});
  }

  return NextResponse.json({ ok: true, gcsObjectPath: newPath });
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
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (bill.status === "approved") {
    return NextResponse.json({ error: "bill_approved_locked" }, { status: 409 });
  }
  if (bill.event.status === "closed") {
    return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  }
  if (!bill.originalGcsObjectPath) {
    return NextResponse.json({ error: "no_original" }, { status: 400 });
  }

  const [buffer] = await billsBucket.file(bill.originalGcsObjectPath).download();
  const contentHash = crypto.createHash("sha256").update(buffer).digest("hex");
  const editedPath = bill.gcsObjectPath;

  await prisma.$transaction(async (tx) => {
    await tx.bill.update({
      where: { id },
      data: {
        gcsObjectPath: bill.originalGcsObjectPath!,
        originalGcsObjectPath: null,
        contentHash,
      },
    });
    await tx.billAuditLog.create({
      data: {
        billId: id,
        userId: user.id,
        actionType: "edit",
        fieldName: "image",
        oldValue: editedPath,
        newValue: bill.originalGcsObjectPath,
      },
    });
  });

  await billsBucket.file(editedPath).delete().catch(() => {});

  return NextResponse.json({ ok: true });
}