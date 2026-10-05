import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Šablony → Účastníci "Převzít pole z akcí": custom fields that exist only in
// events (no org template with that key) become org templates -- the parent
// portal and the public form only know template fields. The newest event's
// version of each key wins (label, type, options, surfaces). Event rows are
// left as they are. GET = what would be created, POST = create them.
async function candidates() {
  const [templates, rows] = await Promise.all([
    prisma.participantFieldTemplate.findMany({ select: { key: true } }),
    prisma.eventParticipantField.findMany({
      where: { kind: "custom" },
      include: { event: { select: { name: true, startDate: true } } },
      orderBy: { event: { startDate: "desc" } },
    }),
  ]);
  const taken = new Set(templates.map((t) => t.key));
  const byKey = new Map<string, { row: (typeof rows)[number]; events: string[] }>();
  for (const r of rows) {
    if (taken.has(r.key)) continue;
    const hit = byKey.get(r.key);
    if (hit) hit.events.push(r.event.name);
    else byKey.set(r.key, { row: r, events: [r.event.name] });
  }
  return [...byKey.values()];
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json((await candidates()).map(({ row, events }) => ({ key: row.key, label: row.label, fieldType: row.fieldType, events })));
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const list = await candidates();
  await prisma.participantFieldTemplate.createMany({
    data: list.map(({ row }) => ({
      key: row.key,
      label: row.label,
      fieldType: row.fieldType,
      options: row.options ?? undefined,
      defaultSurfaces: row.surfaces,
      active: row.active,
    })),
    skipDuplicates: true,
  });
  return NextResponse.json({ created: list.length });
}
