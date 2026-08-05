import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { billsBucket } from "@/lib/gcs";

export async function GET(
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

  const file = billsBucket.file(bill.gcsObjectPath);
  const [metadata] = await file.getMetadata();
  const [buffer] = await file.download();

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": metadata.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(bill.originalFilename)}"`,
      "Cache-Control": "private, no-cache, must-revalidate",
      "ETag": `"${bill.contentHash}"`,
    },
  });
}
