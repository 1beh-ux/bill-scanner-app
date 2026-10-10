import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { orgIdOfUser } from "@/lib/org-owner";
import { getActingOrgId, isOrgAdmin } from "@/lib/org-scope";

// Šablony → Účastníci "Převzít pole z akcí": custom fields that exist only in
// events (no org template with that key) become org templates -- the parent
// portal and the public form only know template fields. The newest event's
// version of each key wins (label, type, options, surfaces). Event rows are
// left as they are. GET = what would be created, POST = create them (all, or `keys`).
async function candidates(organizationId: string) {
  const [templates, rows] = await Promise.all([
    // The organization's own keys (unique per organization since organizations step 4).
    prisma.participantFieldTemplate.findMany({ where: { organizationId }, select: { key: true } }),
    prisma.eventParticipantField.findMany({
      // The organization's own events only.
      where: { kind: "custom", event: { organizationId } },
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
  if (!isOrgAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json((await candidates(await getActingOrgId(user))).map(({ row, events }) => ({ key: row.key, label: row.label, fieldType: row.fieldType, events })));
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isOrgAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // Optional `keys`: only the fields ticked in the picker.
  const { keys } = await req.json().catch(() => ({}));
  const only = Array.isArray(keys) ? new Set(keys.filter((k: unknown): k is string => typeof k === "string")) : null;
  const list = (await candidates(await getActingOrgId(user))).filter(({ row }) => !only || only.has(row.key));
  const organizationId = await orgIdOfUser(user);
  await prisma.participantFieldTemplate.createMany({
    data: list.map(({ row }) => ({
      key: row.key,
      label: row.label,
      fieldType: row.fieldType,
      options: row.options ?? undefined,
      defaultSurfaces: row.surfaces,
      active: row.active,
      organizationId,
    })),
    skipDuplicates: true,
  });
  return NextResponse.json({ created: list.length });
}
