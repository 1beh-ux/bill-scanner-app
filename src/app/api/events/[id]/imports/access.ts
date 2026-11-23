// Who may use the new import (redesign R1): the same people as the old import page (participants / health / mail
// module of the event), only while the organization's Fields Manager flag is on; fields limited as there.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { allowedParticipantFieldKeys, requireAnyModuleAccess } from "@/lib/module-access";
import { eventHasFeature } from "@/lib/org-features";

export async function access(eventId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const denied = await requireAnyModuleAccess(user, eventId, ["participants", "health", "mail"]);
  if (denied) return { error: denied };
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
  if (!event || !(await eventHasFeature(eventId, "fields_manager"))) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  return { organizationId: event.organizationId, userId: user.id, allowed: await allowedParticipantFieldKeys(user, eventId) };
}

