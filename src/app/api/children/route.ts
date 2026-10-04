import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { copyProfileFromLatest, linkChildren, nameKey } from "@/lib/children";
import { profileFieldLabels } from "@/lib/child-profile";
import { participantDisplayName } from "@/lib/participant-name";

// Děti (child profiles) admin page: children with their events, unlinked
// participants, and possible duplicates (same name, different/missing birth date).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "admin_only" }, { status: 403 });

  // ?list=1: just the children, for the add-participant picker.
  if (new URL(req.url).searchParams.get("list")) {
    return NextResponse.json(
      await prisma.child.findMany({
        orderBy: [{ lastName: "asc" }, { name: "asc" }],
        select: { id: true, name: true, firstName: true, lastName: true, dateOfBirth: true },
      })
    );
  }

  const eventSelect = { select: { id: true, name: true, startDate: true, kind: true, membershipYear: true } };
  const [children, unlinked, pending, labels] = await Promise.all([
    prisma.child.findMany({
      orderBy: [{ lastName: "asc" }, { name: "asc" }],
      // The token itself never goes to the list -- only whether one exists.
      select: {
        id: true,
        name: true,
        dateOfBirth: true,
        portalToken: true,
        participants: { select: { id: true, registrationStatus: true, event: eventSelect } },
      },
    }),
    prisma.participant.findMany({
      where: { childId: null },
      select: { id: true, name: true, firstName: true, lastName: true, dateOfBirth: true, event: eventSelect },
      orderBy: { name: "asc" },
    }),
    prisma.childChange.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      include: { child: { select: { name: true } } },
    }),
    profileFieldLabels(),
  ]);

  const byName = new Map<string, string[]>();
  for (const c of children) {
    const k = nameKey(c.name);
    byName.set(k, [...(byName.get(k) ?? []), c.id]);
  }
  return NextResponse.json({
    children: children.map(({ portalToken, ...c }) => ({ ...c, hasPortalLink: !!portalToken })),
    unlinked: unlinked.map((p) => ({ ...p, name: participantDisplayName(p) })),
    duplicates: [...byName.values()].filter((ids) => ids.length > 1),
    pendingChanges: pending.map((c) => ({ ...c, childName: c.child.name, fieldLabel: labels[c.fieldKey] ?? c.fieldKey })),
  });
}

// action: "seed" (link all participants of all events by name + birth date),
// "merge" { keepId, mergeIds }, "link" { participantId, childId: id | "new" | null }
// or "fillProfiles" (empty profiles copied from each child's latest participation).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "admin_only" }, { status: 403 });
  const body = await req.json();

  if (body.action === "seed") {
    return NextResponse.json(await linkChildren({}));
  }

  if (body.action === "merge") {
    const keepId: unknown = body.keepId;
    const mergeIds: string[] = Array.isArray(body.mergeIds) ? body.mergeIds.filter((x: unknown) => typeof x === "string" && x !== keepId) : [];
    if (typeof keepId !== "string" || mergeIds.length === 0) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    await prisma.$transaction(async (tx) => {
      // Profiles: the kept one wins; its empty fields and new guardian e-mails
      // come from the merged ones. Their send log moves along; their pending
      // changes go with them (cascade) -- the parent edits again via the kept link.
      const [keep, others] = await Promise.all([
        tx.child.findUniqueOrThrow({ where: { id: keepId }, include: { guardians: true } }),
        tx.child.findMany({ where: { id: { in: mergeIds } }, include: { guardians: true } }),
      ]);
      const fieldValues = Object.assign({}, ...others.map((o) => (o.fieldValues as object | null) ?? {}), (keep.fieldValues as object | null) ?? {});
      const emails = new Set(keep.guardians.map((g) => g.email.toLowerCase()));
      const moveGuardians = others.flatMap((o) => o.guardians).filter((g) => !emails.has(g.email.toLowerCase()) && emails.add(g.email.toLowerCase()));
      await tx.child.update({ where: { id: keepId }, data: { fieldValues } });
      await tx.childGuardian.updateMany({ where: { id: { in: moveGuardians.map((g) => g.id) } }, data: { childId: keepId } });
      await tx.childEmailLog.updateMany({ where: { childId: { in: mergeIds } }, data: { childId: keepId } });
      await tx.participant.updateMany({ where: { childId: { in: mergeIds } }, data: { childId: keepId } });
      await tx.child.deleteMany({ where: { id: { in: mergeIds } } });
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "fillProfiles") {
    const empty = await prisma.child.findMany({ where: { guardians: { none: {} } }, select: { id: true } });
    let filled = 0;
    for (const c of empty) if (await copyProfileFromLatest(c.id)) filled++;
    return NextResponse.json({ filled });
  }

  if (body.action === "link") {
    const participant = await prisma.participant.findUnique({ where: { id: String(body.participantId) } });
    if (!participant) return NextResponse.json({ error: "not_found" }, { status: 404 });
    let childId: string | null = null;
    if (body.childId === "new") {
      const child = await prisma.child.create({
        data: {
          name: participantDisplayName(participant),
          firstName: participant.firstName,
          lastName: participant.lastName,
          dateOfBirth: participant.dateOfBirth,
        },
      });
      childId = child.id;
    } else if (typeof body.childId === "string") {
      if (!(await prisma.child.findUnique({ where: { id: body.childId } }))) return NextResponse.json({ error: "not_found" }, { status: 404 });
      childId = body.childId;
    }
    await prisma.participant.update({ where: { id: participant.id }, data: { childId } });
    if (body.childId === "new" && childId) await copyProfileFromLatest(childId);
    return NextResponse.json({ ok: true, childId });
  }

  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}
