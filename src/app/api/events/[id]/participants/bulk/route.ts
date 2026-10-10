import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { deleteParticipantCascade } from "@/lib/participant-delete";
import { linkChildren } from "@/lib/children";
import { FAMILY_TARGET_PREFIX } from "@/lib/portal-email";
import { isOrgAdmin } from "@/lib/org-scope";

interface FailureDetail {
  participantId: string;
  name: string;
  error: string;
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
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;

  const body = await req.json();
  const action: string = body.action;
  const participantIds: string[] = body.participantIds || [];

  if (action !== "delete" && action !== "link") {
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }
  if (participantIds.length === 0) {
    return NextResponse.json({ error: "no_participants_selected" }, { status: 400 });
  }

  // "Propojit s Lidmi" (docs/registration-slice8-spec.md #3, admin): links the
  // selected participants by name + birth date, creating the person when
  // missing whatever the event's peopleLinkMode. Returns the portal-link
  // targets of everyone selected who is linked now (family link when in a
  // family) for the compose page -- nothing is sent here.
  if (action === "link") {
    if (!isOrgAdmin(user)) return NextResponse.json({ error: "admin_only" }, { status: 403 });
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { peopleUnlinked: true } });
    if (!event || event.peopleUnlinked) return NextResponse.json({ error: "people_unlinked" }, { status: 409 });
    const where = { id: { in: participantIds.filter((x) => typeof x === "string") }, eventId };
    const { linked, created } = await linkChildren(where, { createMissing: true });
    const rows = await prisma.participant.findMany({ where, select: { child: { select: { id: true, familyId: true } } } });
    const people = rows.flatMap((r) => (r.child ? [r.child] : []));
    return NextResponse.json({
      linked,
      created,
      notLinked: rows.length - people.length,
      targets: [...new Set(people.map((c) => (c.familyId ? `${FAMILY_TARGET_PREFIX}${c.familyId}` : c.id)))],
    });
  }

  // Only operate on participants that actually belong to this event.
  const participants = await prisma.participant.findMany({
    where: { id: { in: participantIds }, eventId },
    select: { id: true, name: true },
  });
  const nameById = new Map(participants.map((p) => [p.id, p.name]));

  const succeeded: string[] = [];
  const failed: FailureDetail[] = [];

  for (const participant of participants) {
    try {
      await deleteParticipantCascade(participant.id);
      succeeded.push(participant.id);
    } catch {
      failed.push({
        participantId: participant.id,
        name: nameById.get(participant.id) || participant.id,
        error: "delete_failed",
      });
    }
  }

  return NextResponse.json({
    action,
    succeededCount: succeeded.length,
    failedCount: failed.length,
    succeeded,
    failed,
  });
}
