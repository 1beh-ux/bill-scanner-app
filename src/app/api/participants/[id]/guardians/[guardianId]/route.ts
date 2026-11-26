import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { cleanGuardianExtra } from "@/lib/guardian-fields";
import { guardianSettings } from "@/lib/guardian-fields-server";
import { orgIdOfEvent } from "@/lib/org-owner";

async function loadGuardianWithEvent(guardianId: string) {
  return prisma.participantGuardian.findUnique({
    where: { id: guardianId },
    include: { participant: { select: { eventId: true } } },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; guardianId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { guardianId } = await params;
  const guardian = await loadGuardianWithEvent(guardianId);
  if (!guardian) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireAnyModuleAccess(user, guardian.participant.eventId, ["participants", "health", "mail"]);
  if (denied) return denied;

  const body = await req.json();
  const { name, email, relationship, phone, receivesCommunications } = body;
  // The organization's own guardian fields (2026-11-26), cleaned by their type.
  const extra = body.extra !== undefined ? cleanGuardianExtra((await guardianSettings(await orgIdOfEvent(guardian.participant.eventId))).fields, body.extra) : undefined;
  if (extra === null) return NextResponse.json({ error: "invalid_extra" }, { status: 400 });

  if (email !== undefined && (typeof email !== "string" || !email.trim())) {
    return NextResponse.json({ error: "guardian_email_required" }, { status: 400 });
  }

  const updated = await prisma.participantGuardian.update({
    where: { id: guardianId },
    data: {
      ...(name !== undefined && { name: name?.trim() || null }),
      ...(email !== undefined && { email: email.trim() }),
      ...(relationship !== undefined && { relationship: relationship?.trim() || null }),
      ...(phone !== undefined && { phone: phone?.trim() || null }),
      ...(receivesCommunications !== undefined && { receivesCommunications }),
      ...(extra !== undefined && { extra }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; guardianId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { guardianId } = await params;
  const guardian = await loadGuardianWithEvent(guardianId);
  if (!guardian) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireAnyModuleAccess(user, guardian.participant.eventId, ["participants", "health", "mail"]);
  if (denied) return denied;

  await prisma.participantGuardian.delete({ where: { id: guardianId } });

  return NextResponse.json({ ok: true });
}
