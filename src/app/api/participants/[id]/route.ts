import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";

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
    include: { guardians: true },
  });
  if (!participant) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireModuleAccess(user, participant.eventId, "health");
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
  const denied = await requireModuleAccess(user, existing.eventId, "health");
  if (denied) return denied;

  const body = await req.json();
  const { name, groupName, dateOfBirth, allergies, medsNotes, chronicIssues, otherNotes, active } = body;

  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }

  const updated = await prisma.participant.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(groupName !== undefined && { groupName: groupName || null }),
      ...(dateOfBirth !== undefined && { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null }),
      ...(allergies !== undefined && { allergies: allergies || null }),
      ...(medsNotes !== undefined && { medsNotes: medsNotes || null }),
      ...(chronicIssues !== undefined && { chronicIssues: chronicIssues || null }),
      ...(otherNotes !== undefined && { otherNotes: otherNotes || null }),
      ...(active !== undefined && { active }),
    },
    include: { guardians: true },
  });

  return NextResponse.json(updated);
}
