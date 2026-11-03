import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { billsBucket, sanitizeFilename } from "@/lib/gcs";
import { personalGuard } from "@/lib/personal-bills-server";

// "Nahradit soubor" on a personal bill: a better photo / the PDF instead of the old file (or onto a bill without
// one). The bill's data stay. The old file goes unless an official bill still uses it (moved bills share it).
const MIME_OK = /^(application\/pdf|image\/(jpeg|png|webp|heic))$/;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; billId: string }> }) {
  const { id, billId } = await params;
  const g = await personalGuard(id);
  if ("error" in g) return g.error;
  if (g.event.status === "closed") return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  const bill = await prisma.personalBill.findFirst({ where: { id: billId, eventId: id }, select: { id: true, gcsObjectPath: true } });
  if (!bill) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File) || file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (!MIME_OK.test(file.type)) return NextResponse.json({ error: "bad_type" }, { status: 400 });
  const path = `events/${id}/personal/${crypto.randomUUID()}-${sanitizeFilename(file.name || "uctenka.pdf")}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await billsBucket.file(path).save(buffer, { contentType: file.type });
  await prisma.personalBill.update({ where: { id: billId }, data: { gcsObjectPath: path, originalFilename: file.name || null, sizeBytes: BigInt(buffer.length) } });
  if (bill.gcsObjectPath && !(await prisma.bill.count({ where: { OR: [{ gcsObjectPath: bill.gcsObjectPath }, { originalGcsObjectPath: bill.gcsObjectPath }] } })))
    await billsBucket.file(bill.gcsObjectPath).delete().catch(() => {});
  return NextResponse.json({ ok: true });
}
