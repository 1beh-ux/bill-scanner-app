import { NextRequest, NextResponse } from "next/server";
import { requireBillAccess } from "@/lib/bank/bill-access";
import { attachDocument } from "@/lib/bank/document";

export const maxDuration = 120;

// Upload a document onto a bill created from a payment: stored, documentMissing cleared, AI runs;
// the bank pairing stays.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireBillAccess((await params).id);
  if ("error" in a) return a.error;
  const file = (await req.formData()).get("file");
  if (!(file instanceof File) || file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "no_file" }, { status: 400 });
  const r = await attachDocument({ billId: a.bill.id, buffer: Buffer.from(await file.arrayBuffer()), filename: file.name || "doklad.pdf", contentType: file.type, userId: a.user.id });
  return NextResponse.json(r, { status: "error" in r ? 409 : 200 });
}
