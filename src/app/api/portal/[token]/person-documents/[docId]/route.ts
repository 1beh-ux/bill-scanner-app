import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { billsBucket } from "@/lib/gcs";
import { portalScope } from "@/lib/portal-server";

// A person's permanent document ("z profilu", slice 6) for the parent to download.
// Token + gate + ownership: the person must be a member of this link's scope; a
// revoked ("Neplatí") document isn't served.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await params;
  const { scope, error } = await portalScope(token, true);
  if (error) return error;
  const doc = await prisma.personDocument.findUnique({ where: { id: docId } });
  if (!doc || doc.revokedAt || !scope.members.some((m) => m.id === doc.childId)) return NextResponse.json({ error: "not_found" }, { status: 404 });

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
