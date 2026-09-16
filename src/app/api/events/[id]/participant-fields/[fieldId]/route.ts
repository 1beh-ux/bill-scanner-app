import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";

async function loadOwnedField(eventId: string, fieldId: string) {
  const field = await prisma.eventParticipantField.findUnique({ where: { id: fieldId } });
  if (!field || field.eventId !== eventId) return null;
  return field;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fieldId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId, fieldId } = await params;
  const existing = await loadOwnedField(eventId, fieldId);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;

  const body = await req.json();
  const { label, fieldType, options, surfaces, sortOrder, active, includeInDocuments } = body;
  if (label !== undefined && (typeof label !== "string" || !label.trim())) {
    return NextResponse.json({ error: "label_required" }, { status: 400 });
  }

  const updated = await prisma.eventParticipantField.update({
    where: { id: fieldId },
    data: {
      ...(label !== undefined && { label: label.trim() }),
      ...(fieldType !== undefined && { fieldType }),
      ...(options !== undefined && { options }),
      ...(surfaces !== undefined && { surfaces }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(active !== undefined && { active }),
    },
  });

  if (label !== undefined || includeInDocuments !== undefined) {
    await prisma.mergeVariable.updateMany({
      where: { key: existing.key },
      data: {
        ...(label !== undefined && { label: label.trim() }),
        ...(includeInDocuments !== undefined && { active: includeInDocuments }),
      },
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fieldId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId, fieldId } = await params;
  const existing = await loadOwnedField(eventId, fieldId);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;

  // Unlike EventListItem (referenced by ParticipantDocument's FK), nothing
  // references EventParticipantField by foreign key -- values live in
  // Participant.customFieldValues, a plain JSON blob keyed by field key, so
  // there's no constraint to trip here.
  await prisma.eventParticipantField.delete({ where: { id: fieldId } });
  return NextResponse.json({ ok: true });
}
