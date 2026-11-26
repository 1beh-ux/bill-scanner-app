import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { portalScope } from "@/lib/portal-server";
import { documentAttachmentsFor } from "@/lib/participant-bulk-email";
import { takeRateSlot } from "@/lib/portal-rate";
import type { DocumentTypeData } from "@/lib/mail-reply-template";

// "Stáhnout" a document in the parent portal (2026-11-26): an accepted registration's document from its template,
// created when the parent asks for it (no e-mail needed, e.g. "Přijmout, nic neposílat") -- the same merge as the
// acceptance, stored as the generated document (admin + Drive) and returned as the PDF.
// POST { participantId, typeId }. Token + gate + ownership like the document download.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { scope, error } = await portalScope(token, true);
  if (error) return error;
  const b = ((await req.json().catch(() => null)) ?? {}) as { participantId?: unknown; typeId?: unknown };
  if (typeof b.participantId !== "string" || typeof b.typeId !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const p = await prisma.participant.findUnique({ where: { id: b.participantId }, select: { id: true, childId: true, eventId: true, registrationStatus: true } });
  const type = await prisma.eventListItem.findUnique({ where: { id: b.typeId }, select: { eventId: true, kind: true, active: true, data: true } });
  const data = type?.data as DocumentTypeData | null;
  const ok =
    p && scope.members.some((m) => m.id === p.childId) && p.registrationStatus === "accepted" &&
    type?.eventId === p.eventId && type.kind === "document" && type.active && !!data?.templateGoogleDocId && !data.staticAttachment;
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // A merge takes Google work: a few per registration per hour is plenty.
  if (!(await takeRateSlot(`portal-generate:${p.id}`, 10, 3600 * 1000))) return NextResponse.json({ error: "throttled" }, { status: 429 });

  const event = await prisma.event.findUniqueOrThrow({ where: { id: p.eventId } });
  const r = await documentAttachmentsFor(p.id, event, [b.typeId], null, new Map());
  const pdf = r.attachments[0];
  if (!pdf) return NextResponse.json({ error: "generate_failed" }, { status: 502 });
  return new NextResponse(new Uint8Array(pdf.buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(pdf.filename)}`, "Cache-Control": "private, no-store" },
  });
}
