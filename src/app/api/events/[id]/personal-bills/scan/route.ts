import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { billsBucket, sanitizeFilename } from "@/lib/gcs";
import { extractBillWithAi } from "@/lib/ai-extraction";
import { personalGuard } from "@/lib/personal-bills-server";

// "Nahrát fotku": stores the receipt and lets the bill AI read shop, date and total to prefill the form.
// Nothing else happens: the person still splits it by hand and saves.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await personalGuard(id);
  if ("error" in g) return g.error;
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const gcsObjectPath = `events/${id}/personal/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;
  await billsBucket.file(gcsObjectPath).save(Buffer.from(await file.arrayBuffer()), { contentType: file.type || "application/octet-stream" });
  // The AI needs the event's categories (it also guesses one); for a personal bill only shop / date / total matter.
  const categories = await prisma.eventCategory.findMany({ where: { eventId: id }, select: { name: true, description: true } });
  let prefill: { merchantName: string | null; billDate: string | null; totalAmount: number | null; currency: string | null } = { merchantName: null, billDate: null, totalAmount: null, currency: null };
  try {
    const r = await extractBillWithAi(gcsObjectPath, file.name, categories.length ? categories : [{ name: "Ostatní", description: null }], { eventId: id, userId: g.user.id, purpose: "personal_bill" });
    prefill = { merchantName: r.data?.merchant_name ?? null, billDate: r.data?.invoice_date ?? null, totalAmount: r.data?.total_amount ?? null, currency: r.data?.currency ?? null };
  } catch {
    // Read failed: the photo stays, the form is filled by hand.
  }
  return NextResponse.json({ gcsObjectPath, originalFilename: file.name, ...prefill });
}
