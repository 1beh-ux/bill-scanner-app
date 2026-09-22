import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess, allowedParticipantFieldKeys } from "@/lib/module-access";
import { deleteParticipantCascade } from "@/lib/participant-delete";
import { fullNameFrom } from "@/lib/participant-name";

// Core-identity view of a participant (name/group/dob/registration status)
// for the central "Seznam účastníků" section, reachable by health OR mail
// grants. All custom fields -- health notes included -- now share one JSON
// blob (Participant.customFieldValues) rather than separate typed columns,
// so the boundary that used to come for free from a narrow `select` has to
// be enforced explicitly here: allowedParticipantFieldKeys strips out any
// key whose field is surfaced for health only when the caller lacks health
// access (see that function's own comment for the exact rule).
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
      firstName: true,
      lastName: true,
      groupName: true,
      dateOfBirth: true,
      registrationStatus: true,
      customFieldValues: true,
      // Part 2: guardians are editable from the central roster now, not just add/delete
      // from the Health detail page -- this is the roster's own "give me everything to
      // edit" read, so the full rows (including phone) belong here. No orderBy: there's
      // no createdAt on this model to sort by, and the DB's natural row order is closer
      // to insertion order than any derived key (id is a random UUID) would be.
      guardians: true,
    },
  });
  if (!participant) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireAnyModuleAccess(user, participant.eventId, ["health", "mail"]);
  if (denied) return denied;

  const allowedKeys = await allowedParticipantFieldKeys(user, participant.eventId);
  const scoped = {
    ...participant,
    customFieldValues: Object.fromEntries(
      Object.entries((participant.customFieldValues as Record<string, string> | null) ?? {}).filter(([key]) =>
        allowedKeys.has(key)
      )
    ),
  };

  return NextResponse.json(scoped);
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
  const { groupName, dateOfBirth, customFieldValues } = body;
  const firstName: string | undefined = typeof body.firstName === "string" ? body.firstName.trim() : undefined;
  const lastName: string | undefined = typeof body.lastName === "string" ? body.lastName.trim() : undefined;
  // Editing firstName/lastName recomputes `name` from the merged pair (the field not sent
  // keeps its existing value) so the maintained display name never drifts out of sync.
  const splitChanged = firstName !== undefined || lastName !== undefined;
  const name: string | undefined = splitChanged
    ? fullNameFrom(firstName ?? existing.firstName, lastName ?? existing.lastName)
    : body.name;

  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }

  const allowedKeys = await allowedParticipantFieldKeys(user, existing.eventId);

  // Merge rather than replace -- the edit form only ever submits every
  // active field's value together, but merging keeps this route safe for
  // any future caller that only wants to touch one key. Keys outside the
  // caller's allowed set are silently dropped rather than erroring -- a
  // mail-only caller's own edit form never renders them in the first
  // place, so this only guards against a crafted request, not a normal
  // partial edit.
  const mergedCustomFieldValues: Record<string, string> | undefined =
    customFieldValues !== undefined
      ? {
          ...((existing.customFieldValues as Record<string, string> | null) ?? {}),
          ...Object.fromEntries(
            Object.entries(customFieldValues as Record<string, string>).filter(([key]) => allowedKeys.has(key))
          ),
        }
      : undefined;

  const updated = await prisma.participant.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(firstName !== undefined && { firstName: firstName || null }),
      ...(lastName !== undefined && { lastName: lastName || null }),
      ...(groupName !== undefined && { groupName: groupName || null }),
      ...(dateOfBirth !== undefined && { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null }),
      ...(mergedCustomFieldValues !== undefined && { customFieldValues: mergedCustomFieldValues }),
    },
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      groupName: true,
      dateOfBirth: true,
      registrationStatus: true,
      customFieldValues: true,
    },
  });

  const scoped = {
    ...updated,
    customFieldValues: Object.fromEntries(
      Object.entries((updated.customFieldValues as Record<string, string> | null) ?? {}).filter(([key]) =>
        allowedKeys.has(key)
      )
    ),
  };

  return NextResponse.json(scoped);
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
