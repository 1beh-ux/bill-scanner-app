import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { linkChildren, nameKey } from "@/lib/children";
import { participantDisplayName } from "@/lib/participant-name";

// Děti (child profiles) admin page: children with their events, unlinked
// participants, and possible duplicates (same name, different/missing birth date).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "admin_only" }, { status: 403 });

  const eventSelect = { select: { id: true, name: true, startDate: true, kind: true, membershipYear: true } };
  const [children, unlinked] = await Promise.all([
    prisma.child.findMany({
      orderBy: [{ lastName: "asc" }, { name: "asc" }],
      include: { participants: { select: { id: true, registrationStatus: true, event: eventSelect } } },
    }),
    prisma.participant.findMany({
      where: { childId: null },
      select: { id: true, name: true, firstName: true, lastName: true, dateOfBirth: true, event: eventSelect },
      orderBy: { name: "asc" },
    }),
  ]);

  const byName = new Map<string, string[]>();
  for (const c of children) {
    const k = nameKey(c.name);
    byName.set(k, [...(byName.get(k) ?? []), c.id]);
  }
  return NextResponse.json({
    children,
    unlinked: unlinked.map((p) => ({ ...p, name: participantDisplayName(p) })),
    duplicates: [...byName.values()].filter((ids) => ids.length > 1),
  });
}

// action: "seed" (link all participants of all events by name + birth date),
// "merge" { keepId, mergeIds } or "link" { participantId, childId: id | "new" | null }.
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
    await prisma.$transaction([
      prisma.participant.updateMany({ where: { childId: { in: mergeIds } }, data: { childId: keepId } }),
      prisma.child.deleteMany({ where: { id: { in: mergeIds } } }),
    ]);
    return NextResponse.json({ ok: true });
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
    return NextResponse.json({ ok: true, childId });
  }

  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}
