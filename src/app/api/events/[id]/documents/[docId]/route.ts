import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { billsBucket } from "@/lib/gcs";

// One stored participant document of the event, for the admin (slice 4 #7).
// GET: the file (?inline=1 to preview in the browser, else a download).
// POST { action: "approve" } | { action: "reject", note }: review of a portal
// upload. Approve = counts as received, the reviewer becomes the receiving
// user; reject needs a short reason, the parent sees it and may upload again.
// No e-mail either way.
async function load(params: Promise<{ id: string; docId: string }>) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const { id: eventId, docId } = await params;
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return { error: denied };
  const doc = await prisma.participantDocument.findUnique({ where: { id: docId }, include: { participant: { select: { eventId: true } } } });
  if (!doc || doc.participant.eventId !== eventId) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  return { user, doc };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { doc, error } = await load(params);
  if (error) return error;
  if (!doc.gcsPath) return NextResponse.json({ error: "no_file" }, { status: 404 });
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { user, doc, error } = await load(params);
  if (error) return error;
  if (doc.reviewStatus == null) return NextResponse.json({ error: "not_reviewable" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const reviewed = { reviewedByUserId: user.id, reviewedAt: new Date() };
  if (body.action === "approve") {
    return NextResponse.json(await prisma.participantDocument.update({ where: { id: doc.id }, data: { ...reviewed, reviewStatus: "approved", reviewNote: null, receivedByUserId: user.id } }));
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
  if (body.action === "reject" && note) {
    return NextResponse.json(await prisma.participantDocument.update({ where: { id: doc.id }, data: { ...reviewed, reviewStatus: "rejected", reviewNote: note } }));
  }
  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}
