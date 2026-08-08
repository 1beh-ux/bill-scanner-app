import { NextRequest, NextResponse } from "next/server";
import type { IngestChannel } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ingestBillFiles } from "@/lib/bill-ingest";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const bills = await prisma.bill.findMany({
    where: { eventId: id },
    orderBy: { createdAt: "desc" },
    include: {
      payerAuthor: { select: { canonicalName: true } },
      categories: { include: { eventCategory: { select: { name: true } } } },
    },
  });

  return NextResponse.json(bills);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: eventId } = await params;

  const formData = await req.formData();
  const files = formData.getAll("files") as File[];
  const ingestChannel: IngestChannel =
    formData.get("ingestChannel") === "camera" ? "camera" : "upload";

  if (!files || files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const rawFiles = await Promise.all(
    files.map(async (file) => ({
      filename: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || "application/octet-stream",
    }))
  );

  const result = await ingestBillFiles(eventId, user.id, ingestChannel, rawFiles);

  return NextResponse.json(result, { status: 201 });
}