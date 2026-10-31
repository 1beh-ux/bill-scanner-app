import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractBillWithAi } from "@/lib/ai-extraction";
import { personalGuard } from "@/lib/personal-bills-server";

// "Načíst znovu AI": the bill AI reads a saved personal bill's photo again -- shop, date, total and the lines.
// Nothing is saved here: the form fills its empty fields and the lines, the person saves.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; billId: string }> }) {
  const { id, billId } = await params;
  const g = await personalGuard(id);
  if ("error" in g) return g.error;
  const bill = await prisma.personalBill.findFirst({ where: { id: billId, eventId: id }, select: { gcsObjectPath: true, originalFilename: true } });
  if (!bill) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!bill.gcsObjectPath) return NextResponse.json({ error: "no_file" }, { status: 400 });
  const categories = await prisma.eventCategory.findMany({ where: { eventId: id }, select: { name: true, description: true } });
  try {
    const r = await extractBillWithAi(bill.gcsObjectPath, bill.originalFilename ?? bill.gcsObjectPath.split("/").pop()!, categories.length ? categories : [{ name: "Ostatní", description: null }], { eventId: id, userId: g.user.id, purpose: "personal_bill" });
    return NextResponse.json({
      merchantName: r.data?.merchant_name ?? null,
      billDate: r.data?.invoice_date ?? null,
      totalAmount: r.data?.total_amount ?? null,
      currency: r.data?.currency ?? null,
      lineItems: Array.isArray(r.data?.line_items) ? r.data.line_items : [],
    });
  } catch {
    return NextResponse.json({ error: "ai_failed" }, { status: 502 });
  }
}
