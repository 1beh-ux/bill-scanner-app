import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { billsBucket, servedContentType } from "@/lib/gcs";
import { personalGuard } from "@/lib/personal-bills-server";

// The personal bill's photo / PDF.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; billId: string }> }) {
  const { id, billId } = await params;
  const g = await personalGuard(id);
  if ("error" in g) return g.error;
  const bill = await prisma.personalBill.findFirst({ where: { id: billId, eventId: id }, select: { gcsObjectPath: true, originalFilename: true } });
  if (!bill?.gcsObjectPath) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const file = billsBucket.file(bill.gcsObjectPath);
  const [[metadata], [buffer]] = await Promise.all([file.getMetadata(), file.download()]);
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": servedContentType(metadata.contentType, bill.originalFilename ?? bill.gcsObjectPath), "Content-Disposition": `inline; filename="${encodeURIComponent(bill.originalFilename ?? "uctenka")}"`, "Cache-Control": "private, no-cache" },
  });
}
