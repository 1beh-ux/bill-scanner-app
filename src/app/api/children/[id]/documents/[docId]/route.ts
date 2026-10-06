import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { billsBucket } from "@/lib/gcs";
import { requireAnyModuleAccess } from "@/lib/module-access";

// One person document (docs/registration-slice6-spec.md 3-5): GET the file
// (?inline=1 to view, else a download). The file is for admins, or -- like the participant's own
// documents -- for anyone with health / mail access to an event the person
// takes part in (the participant detail's "z profilu" link, ?event=<id>).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id, docId } = await params;
  const doc = await prisma.personDocument.findUnique({ where: { id: docId } });
  if (!doc || doc.childId !== id) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const eventId = new URL(req.url).searchParams.get("event");
  if (user.role !== "admin") {
    const denied = eventId ? await requireAnyModuleAccess(user, eventId, ["health", "mail"]) : NextResponse.json({ error: "admin_only" }, { status: 403 });
    if (denied) return denied;
    if (!(await prisma.participant.findFirst({ where: { eventId: eventId!, childId: id }, select: { id: true } }))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const file = billsBucket.file(doc.gcsPath);
  const [[metadata], [buffer]] = await Promise.all([file.getMetadata(), file.download()]);
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": metadata.contentType || "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.originalFilename || "dokument")}`,
      "Cache-Control": "private, no-store",
      // A parent's file: never run it as part of this origin.
      "Content-Security-Policy": "sandbox",
    },
  });
}
