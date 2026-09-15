import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { deleteParticipantCascade } from "@/lib/participant-delete";

// Core-identity view of a participant (name/group/dob/registration status)
// for the central "Seznam účastníků" section, reachable by health OR mail
// grants. Deliberately separate from /api/participants/[id], which also
// returns health-specific fields (allergies/medsNotes/chronicIssues/
// otherNotes) and stays gated to "health" only -- a mail-only grant must
// never see those (see that route's mail-participants sibling for the same
// rule). Editing health-specific fields still happens on the Health
// participant detail page, unchanged.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const participant = await prisma.participant.findUnique({
    where: { id },
    select: {
      id: true,
      eventId: true,
      name: true,
      groupName: true,
      dateOfBirth: true,
      registrationStatus: true,
      customFieldValues: true,
    },
  });
  if (!participant) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireAnyModuleAccess(user, participant.eventId, ["health", "mail"]);
  if (denied) return denied;

  return NextResponse.json(participant);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const existing = await prisma.participant.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireAnyModuleAccess(user, existing.eventId, ["health", "mail"]);
  if (denied) return denied;

  const body = await req.json();
  const { name, groupName, dateOfBirth, customFieldValues } = body;

  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }

  // Merge rather than replace -- the edit form only ever submits every
  // active field's value together, but merging keeps this route safe for
  // any future caller that only wants to touch one key.
  const mergedCustomFieldValues =
    customFieldValues !== undefined
      ? { ...((existing.customFieldValues as Record<string, string> | null) ?? {}), ...customFieldValues }
      : undefined;

  const updated = await prisma.participant.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(groupName !== undefined && { groupName: groupName || null }),
      ...(dateOfBirth !== undefined && { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null }),
      ...(mergedCustomFieldValues !== undefined && { customFieldValues: mergedCustomFieldValues }),
    },
    select: {
      id: true,
      name: true,
      groupName: true,
      dateOfBirth: true,
      registrationStatus: true,
      customFieldValues: true,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const existing = await prisma.participant.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireAnyModuleAccess(user, existing.eventId, ["health", "mail"]);
  if (denied) return denied;

  await deleteParticipantCascade(id);

  return NextResponse.json({ ok: true });
}
