import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { requireBillAccess } from "@/lib/bank/bill-access";
import { billsBucket, sanitizeFilename } from "@/lib/gcs";
import { processBillWithAi } from "@/lib/process-bill-ai";

export const maxDuration = 120;

// "Nahradit soubor" (2026-11-01): a better scan or the downloaded PDF instead of the bill's file (or onto a bill
// without one). The bill's data stay; { ai: "1" } in the form also lets the AI read the new file. Not on an
// approved bill (reopen it first) or in a closed event.
const MIME_OK = /^(application\/pdf|image\/(jpeg|png|webp))$/;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireBillAccess((await params).id);
  if ("error" in a) return a.error;
  const bill = a.bill;
  // A travel order's PDF is generated from the order (prompt 7).
  if (bill.ingestChannel === "travel_order") return NextResponse.json({ error: "travel_order_locked" }, { status: 409 });
  if (bill.status === "approved") return NextResponse.json({ error: "bill_approved_locked" }, { status: 409 });
  if (bill.status === "queued" || bill.status === "processing") return NextResponse.json({ error: "bill_processing_locked" }, { status: 409 });
  if ((await prisma.event.findUnique({ where: { id: bill.eventId }, select: { status: true } }))?.status === "closed") return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (!MIME_OK.test(file.type)) return NextResponse.json({ error: "bad_type" }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentHash = crypto.createHash("sha256").update(buffer).digest("hex");
  const dup = await prisma.bill.findFirst({ where: { eventId: bill.eventId, contentHash, id: { not: bill.id } }, select: { id: true } });
  if (dup) return NextResponse.json({ error: "duplicate", billId: dup.id }, { status: 409 });

  const path = `events/${bill.eventId}/bills/${bill.id}-${crypto.randomUUID().slice(0, 8)}-${sanitizeFilename(file.name || "doklad.pdf")}`;
  await billsBucket.file(path).save(buffer, { contentType: file.type });
  const old = [bill.gcsObjectPath, bill.originalGcsObjectPath].filter((x): x is string => !!x && x !== path);
  try {
    await prisma.$transaction([
      prisma.bill.update({
        where: { id: bill.id },
        data: { gcsObjectPath: path, originalGcsObjectPath: null, originalFilename: file.name || bill.originalFilename, contentHash, sizeBytes: BigInt(buffer.length), documentMissing: false, documentFromStatement: false },
      }),
      prisma.billAuditLog.create({ data: { billId: bill.id, userId: a.user.id, actionType: "edit", fieldName: "file", oldValue: bill.gcsObjectPath, newValue: path } }),
    ]);
  } catch (err) {
    await billsBucket.file(path).delete().catch(() => {});
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return NextResponse.json({ error: "duplicate" }, { status: 409 });
    throw err;
  }
  // The old file goes unless another bill (or a personal bill) still points at it.
  for (const p of old) {
    const used = (await prisma.bill.count({ where: { OR: [{ gcsObjectPath: p }, { originalGcsObjectPath: p }] } })) + (await prisma.personalBill.count({ where: { gcsObjectPath: p } }));
    if (!used) await billsBucket.file(p).delete().catch(() => {});
  }
  const ai = form.get("ai") === "1" ? await processBillWithAi(bill.id, { userId: a.user.id }) : null;
  return NextResponse.json({ ok: true, ai: ai ? (ai.ok ? ai.status : ai.error) : null });
}
