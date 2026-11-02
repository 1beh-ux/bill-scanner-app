import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { billsBucket, servedContentType } from "@/lib/gcs";
import { PAYOUT_PAYER_WHERE } from "@/lib/payout";

// The receipt behind a line of a person's Vyúčtování (?kind=personal|official&id=): only a bill on that link --
// a personal bill they have a part of or paid, or an official bill they paid.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = token.length <= 64 ? await prisma.settlementLink.findUnique({ where: { token }, select: { eventId: true, authorId: true } }) : null;
  if (!link) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const q = new URL(req.url).searchParams;
  const id = q.get("id") ?? "";
  const file =
    q.get("kind") === "official"
      ? await prisma.bill.findFirst({ where: { id, eventId: link.eventId, payerAuthorId: link.authorId, payerAuthor: PAYOUT_PAYER_WHERE }, select: { gcsObjectPath: true, originalFilename: true } })
      : await prisma.personalBill.findFirst({ where: { id, eventId: link.eventId, OR: [{ authorId: link.authorId }, { shares: { some: { authorId: link.authorId } } }] }, select: { gcsObjectPath: true, originalFilename: true } });
  if (!file?.gcsObjectPath) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const f = billsBucket.file(file.gcsObjectPath);
  const [[metadata], [buffer]] = await Promise.all([f.getMetadata(), f.download()]);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": servedContentType(metadata.contentType, file.originalFilename ?? file.gcsObjectPath),
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.originalFilename ?? "uctenka")}"`,
      "Cache-Control": "private, no-cache",
      // Only receipts (PDF / images); never sniffed into anything else.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
