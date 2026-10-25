import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { billsBucket } from "@/lib/gcs";
import { participantScope } from "@/lib/participant-link";

// A document sent to / received from the parent (the portal's documents route, for this page's participant only).
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await params;
  const { p, error } = await participantScope(token, true);
  if (error) return error;
  const doc = await prisma.participantDocument.findUnique({ where: { id: docId } });
  if (!doc?.gcsPath || doc.participantId !== p.id) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const file = billsBucket.file(doc.gcsPath);
  const [[metadata], [buffer]] = await Promise.all([file.getMetadata(), file.download()]);
  const filename = doc.originalFilename || "dokument.pdf";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": metadata.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
