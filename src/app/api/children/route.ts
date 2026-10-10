import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { orgIdOfEvent } from "@/lib/org-owner";
import { copyProfileFromLatest, linkChildren, nameKey, fillMissingGuardians } from "@/lib/children";
import { profileFieldLabels } from "@/lib/child-profile";
import { participantDisplayName } from "@/lib/participant-name";
import { getActingOrgId, isOrgAdmin, notFound } from "@/lib/org-scope";

// Děti (child profiles) admin page: children with their events, unlinked
// participants, and possible duplicates (same name, different/missing birth date).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isOrgAdmin(user)) return NextResponse.json({ error: "admin_only" }, { status: 403 });
  // Everything here is the acting organization's people only.
  const organizationId = await getActingOrgId(user);

  // ?list=1: just the children, for the add-participant picker.
  if (new URL(req.url).searchParams.get("list")) {
    return NextResponse.json(
      await prisma.child.findMany({
        where: { organizationId },
        orderBy: [{ lastName: "asc" }, { name: "asc" }],
        select: { id: true, name: true, firstName: true, lastName: true, dateOfBirth: true, isAdult: true },
      })
    );
  }

  const eventSelect = { select: { id: true, name: true, startDate: true, kind: true, membershipYear: true } };
  const [children, unlinked, pending, labels] = await Promise.all([
    prisma.child.findMany({
      where: { organizationId },
      orderBy: [{ lastName: "asc" }, { name: "asc" }],
      // The token itself never goes to the list -- only whether one exists.
      select: {
        id: true,
        name: true,
        dateOfBirth: true,
        isAdult: true,
        familyId: true,
        leftAt: true,
        family: { select: { name: true, portalToken: true } },
        portalToken: true,
        participants: { select: { id: true, registrationStatus: true, event: eventSelect } },
      },
    }),
    prisma.participant.findMany({
      // "jen stávající osoby" events (slice 8 #3) keep their unmatched participants out of Lidé on purpose.
      where: { childId: null, event: { organizationId, peopleUnlinked: false, peopleLinkMode: "all" } },
      select: { id: true, name: true, firstName: true, lastName: true, dateOfBirth: true, event: eventSelect },
      orderBy: { name: "asc" },
    }),
    prisma.childChange.findMany({
      where: { status: "pending", child: { organizationId } },
      orderBy: { createdAt: "asc" },
      include: { child: { select: { name: true } } },
    }),
    profileFieldLabels(organizationId),
  ]);

  const byName = new Map<string, string[]>();
  for (const c of children) {
    const k = nameKey(c.name);
    byName.set(k, [...(byName.get(k) ?? []), c.id]);
  }
  return NextResponse.json({
    // Link = the family's for a family member (slice 4 #12 filter), else the person's own.
    children: children.map(({ portalToken, family, ...c }) => ({
      ...c,
      family: family && { name: family.name },
      hasPortalLink: !!portalToken,
      hasLink: family ? !!family.portalToken : !!portalToken,
    })),
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
  if (!isOrgAdmin(user)) return NextResponse.json({ error: "admin_only" }, { status: 403 });
  const body = await req.json();
  // The acting organization's people, events and participants only; another organization's ids are "not found".
  const organizationId = await getActingOrgId(user);
  const inOrg = async (ids: string[]) => (await prisma.child.count({ where: { id: { in: ids }, organizationId } })) === new Set(ids).size;

  if (body.action === "seed") {
    return NextResponse.json(await linkChildren({ event: { organizationId } }));
  }

  if (body.action === "merge") {
    const keepId: unknown = body.keepId;
    const mergeIds: string[] = Array.isArray(body.mergeIds) ? body.mergeIds.filter((x: unknown) => typeof x === "string" && x !== keepId) : [];
    if (typeof keepId !== "string" || mergeIds.length === 0) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    if (!(await inOrg([keepId, ...mergeIds]))) return notFound();
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
      // Family: the kept person's, else the first merged one's (a public-form duplicate brings its new family along).
      const familyId = keep.familyId ?? others.find((o) => o.familyId)?.familyId ?? null;
      await tx.child.update({ where: { id: keepId }, data: { fieldValues, familyId } });
      await tx.childGuardian.updateMany({ where: { id: { in: moveGuardians.map((g) => g.id) } }, data: { childId: keepId } });
      await tx.childEmailLog.updateMany({ where: { childId: { in: mergeIds } }, data: { childId: keepId } });
      await tx.participant.updateMany({ where: { childId: { in: mergeIds } }, data: { childId: keepId } });
      await tx.personDocument.updateMany({ where: { childId: { in: mergeIds } }, data: { childId: keepId } });
      await tx.child.deleteMany({ where: { id: { in: mergeIds } } });
      // A family left without members (e.g. a public-form duplicate merged away) goes too.
      const familyIds = others.map((o) => o.familyId).filter((x): x is string => !!x && x !== familyId);
      if (familyIds.length) await tx.family.deleteMany({ where: { id: { in: familyIds }, members: { none: {} } } });
    });
    return NextResponse.json({ ok: true });
  }

  // "Smazat" (selected people): only people with no event registrations and no
  // permanent documents -- anyone else is skipped and reported. Guardians,
  // pending changes and e-mail log go with them (cascade), so does their own
  // portal link; a family left empty is removed with its link.
  if (body.action === "delete") {
    const ids: string[] = Array.isArray(body.childIds) ? body.childIds.filter((x: unknown): x is string => typeof x === "string") : [];
    const people = await prisma.child.findMany({
      where: { id: { in: ids }, organizationId },
      select: { id: true, familyId: true, _count: { select: { participants: true, documents: true } } },
    });
    const ok = people.filter((c) => c._count.participants === 0 && c._count.documents === 0);
    await prisma.child.deleteMany({ where: { id: { in: ok.map((c) => c.id) } } });
    const familyIds = [...new Set(ok.map((c) => c.familyId).filter((x): x is string => !!x))];
    if (familyIds.length) await prisma.family.deleteMany({ where: { id: { in: familyIds }, members: { none: {} } } });
    return NextResponse.json({ deleted: ok.length, skipped: people.length - ok.length });
  }

  if (body.action === "fillProfiles") {
    const empty = await prisma.child.findMany({ where: { organizationId, guardians: { none: {} } }, select: { id: true } });
    let filled = 0;
    for (const c of empty) if (await copyProfileFromLatest(c.id)) filled++;
    // Profiles that had values but no guardians: guardians from the latest event that has any.
    filled += await fillMissingGuardians({ organizationId });
    return NextResponse.json({ filled });
  }

  if (body.action === "link") {
    const participant = await prisma.participant.findFirst({ where: { id: String(body.participantId), event: { organizationId } } });
    if (!participant) return NextResponse.json({ error: "not_found" }, { status: 404 });
    let childId: string | null = null;
    if (body.childId === "new") {
      const child = await prisma.child.create({
        data: {
          name: participantDisplayName(participant),
          firstName: participant.firstName,
          lastName: participant.lastName,
          dateOfBirth: participant.dateOfBirth,
          organizationId: await orgIdOfEvent(participant.eventId),
        },
      });
      childId = child.id;
    } else if (typeof body.childId === "string") {
      if (!(await inOrg([body.childId]))) return NextResponse.json({ error: "not_found" }, { status: 404 });
      childId = body.childId;
    }
    await prisma.participant.update({ where: { id: participant.id }, data: { childId } });
    if (body.childId === "new" && childId) await copyProfileFromLatest(childId);
    return NextResponse.json({ ok: true, childId });
  }

  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}
