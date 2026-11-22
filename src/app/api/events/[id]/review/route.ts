// Fields Manager phase 5: the event's review queue ("Ke kontrole") -- open items of automatic syncs.
import { NextRequest, NextResponse } from "next/server";
import { fieldsManagerAccess } from "@/app/api/fields/access";
import { prisma } from "@/lib/prisma";
import { loadSyncs } from "@/lib/participant-sync-run";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const a = await fieldsManagerAccess();
  if ("error" in a) return a.error;
  if (!(await prisma.event.findFirst({ where: { id: eventId, organizationId: a.organizationId }, select: { id: true } }))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const [items, syncs, participants, fields] = await Promise.all([
    prisma.syncReviewItem.findMany({ where: { eventId, status: "pending" }, orderBy: { createdAt: "asc" }, take: 500 }),
    loadSyncs(eventId),
    prisma.participant.findMany({ where: { eventId }, orderBy: { name: "asc" }, select: { id: true, name: true, dateOfBirth: true } }),
    prisma.eventParticipantField.findMany({ where: { eventId, active: true }, select: { key: true, label: true, fieldType: true, options: true } }),
  ]);
  return NextResponse.json({
    items: items.map((i) => ({ id: i.id, syncId: i.syncId, kind: i.kind, payload: i.payload, createdAt: i.createdAt })),
    syncs: syncs.map((s) => ({ id: s.id, name: s.name })),
    participants: participants.map((p) => ({ id: p.id, name: p.name, dateOfBirth: p.dateOfBirth?.toISOString().slice(0, 10) ?? null })),
    fields,
  });
}
