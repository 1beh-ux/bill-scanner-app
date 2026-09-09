import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { getActiveDocumentTypes } from "@/lib/mail-helper-context";

type GuardianInput = {
  name?: string;
  email: string;
  relationship?: string;
  receivesCommunications?: boolean;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "health");
  if (denied) return denied;

  const participants = await prisma.participant.findMany({
    where: { eventId },
    orderBy: { name: "asc" },
  });

  // Documents-status summary for the list view: one extra query total (not
  // per-participant) -- how many of the event's active document types each
  // participant already has a ParticipantDocument row for.
  const documentTypes = await getActiveDocumentTypes(eventId);
  const receivedCounts: Record<string, number> = {};
  if (documentTypes.length > 0 && participants.length > 0) {
    const rows = await prisma.participantDocument.findMany({
      where: {
        participantId: { in: participants.map((p) => p.id) },
        eventListItemId: { in: documentTypes.map((d) => d.id) },
      },
      select: { participantId: true },
    });
    for (const r of rows) receivedCounts[r.participantId] = (receivedCounts[r.participantId] ?? 0) + 1;
  }

  const withDocuments = participants.map((p) => ({
    ...p,
    documentsTotal: documentTypes.length,
    documentsReceived: receivedCounts[p.id] ?? 0,
  }));

  return NextResponse.json(withDocuments);
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
  const denied = await requireModuleAccess(user, eventId, "health");
  if (denied) return denied;

  const body = await req.json();
  const { name, groupName, dateOfBirth, allergies, medsNotes, chronicIssues, otherNotes } = body;
  const guardians: GuardianInput[] = Array.isArray(body.guardians) ? body.guardians : [];

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }
  for (const g of guardians) {
    if (!g.email || typeof g.email !== "string" || !g.email.trim()) {
      return NextResponse.json({ error: "guardian_email_required" }, { status: 400 });
    }
  }

  const participant = await prisma.$transaction(async (tx) => {
    const created = await tx.participant.create({
      data: {
        eventId,
        name: name.trim(),
        groupName: groupName || null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        allergies: allergies || null,
        medsNotes: medsNotes || null,
        chronicIssues: chronicIssues || null,
        otherNotes: otherNotes || null,
      },
    });

    if (guardians.length > 0) {
      await tx.participantGuardian.createMany({
        data: guardians.map((g) => ({
          participantId: created.id,
          name: g.name?.trim() || null,
          email: g.email.trim(),
          relationship: g.relationship?.trim() || null,
          receivesCommunications: g.receivesCommunications ?? true,
        })),
      });
    }

    return tx.participant.findUniqueOrThrow({
      where: { id: created.id },
      include: { guardians: true },
    });
  });

  return NextResponse.json(participant, { status: 201 });
}
