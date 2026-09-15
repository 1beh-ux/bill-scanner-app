import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";

// Copies active org-wide ParticipantFieldTemplate rows into this event's
// EventParticipantField list, skipping any key already present -- same
// shape as categories/sync and list-items/sync. Synced fields default to
// surfaces: ["list"] (visible on the central roster only); widen from the
// event's Účastníci settings tab afterward.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;

  const [templates, existing] = await Promise.all([
    prisma.participantFieldTemplate.findMany({ where: { active: true } }),
    prisma.eventParticipantField.findMany({ where: { eventId }, select: { key: true } }),
  ]);
  const existingKeys = new Set(existing.map((e) => e.key));
  const toAdd = templates.filter((t) => !existingKeys.has(t.key));

  if (toAdd.length > 0) {
    await prisma.eventParticipantField.createMany({
      data: toAdd.map((t) => ({
        eventId,
        key: t.key,
        label: t.label,
        fieldType: t.fieldType,
        options: t.options ?? undefined,
        surfaces: ["list"],
        isFromTemplate: true,
      })),
    });
  }

  return NextResponse.json({ added: toAdd.length });
}
