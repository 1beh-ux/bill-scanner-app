import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { isOrgAdmin, requireEventInOrg } from "@/lib/org-scope";
import { PUBLIC_TEXT_PREFIXES, readPublicTexts } from "@/lib/public-texts";

// Nastavení akce -> Veřejná přihláška -> Texty: this event's own wording on its registration page, over
// the organization's (src/lib/public-texts.ts). The same people as the rest of that tab.
async function guard(eventId: string) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (isOrgAdmin(user)) return requireEventInOrg(user, eventId).then((r) => ("error" in r ? r.error : null));
  return requireAnyModuleAccess(user, eventId, ["participants", "tickets"]);
}

async function view(eventId: string) {
  const [defaults, e] = await Promise.all([
    prisma.translation.findMany({ where: { OR: PUBLIC_TEXT_PREFIXES.map((p) => ({ key: { startsWith: p } })) }, select: { key: true, cs: true }, orderBy: { key: "asc" } }),
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { publicTexts: true, organization: { select: { publicTexts: true } } } }),
  ]);
  return { defaults, orgTexts: readPublicTexts(e.organization.publicTexts), texts: readPublicTexts(e.publicTexts) };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guard(id);
  if (denied) return denied;
  return NextResponse.json(await view(id));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guard(id);
  if (denied) return denied;
  const texts = readPublicTexts(((await req.json().catch(() => ({}))) as { texts?: unknown }).texts);
  await prisma.event.update({ where: { id }, data: { publicTexts: Object.keys(texts).length ? texts : Prisma.DbNull } });
  return NextResponse.json(await view(id));
}
