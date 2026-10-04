import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { billsBucket } from "@/lib/gcs";
import { portalScope } from "@/lib/portal-server";

// A document sent to / received from the parent, from the same storage the
// admin side uses (ParticipantDocument.gcsPath). Token + gate + ownership: the
// document's participant must be a member of this link's scope, in an event using the module.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await params;
  const { scope, error } = await portalScope(token, true);
  if (error) return error;
  const doc = await prisma.participantDocument.findUnique({
    where: { id: docId },
    include: { participant: { select: { childId: true, event: { select: { registrationConnected: true, kind: true } } } } },
  });
  const ok = doc?.gcsPath && scope.members.some((m) => m.id === doc.participant.childId) && (doc.participant.event.registrationConnected || doc.participant.event.kind === "membership");
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const file = billsBucket.file(doc.gcsPath!);
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
