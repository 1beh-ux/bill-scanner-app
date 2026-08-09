import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { billsBucket } from "@/lib/gcs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t0 = Date.now();
  const user = await getCurrentUser();
  console.log("[file-route] auth check:", Date.now() - t0, "ms");
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const t1 = Date.now();
  const bill = await prisma.bill.findUnique({ where: { id } });
  console.log("[file-route] db lookup:", Date.now() - t1, "ms");
  if (!bill) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const file = billsBucket.file(bill.gcsObjectPath);

  const t2 = Date.now();
  const [metadata] = await file.getMetadata();
  console.log("[file-route] gcs getMetadata:", Date.now() - t2, "ms");

  const t3 = Date.now();
  const [buffer] = await file.download();
  console.log("[file-route] gcs download:", Date.now() - t3, "ms, size:", buffer.length, "bytes");

  console.log("[file-route] TOTAL:", Date.now() - t0, "ms");

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": metadata.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(bill.originalFilename)}"`,
      "Cache-Control": "private, no-cache, must-revalidate",
      "ETag": `"${bill.contentHash}"`,
    },
  });
}