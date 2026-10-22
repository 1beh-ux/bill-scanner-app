import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId, isOrgAdmin } from "@/lib/org-scope";
import { PUBLIC_TEXT_PREFIXES, readPublicTexts } from "@/lib/public-texts";

// Organizace -> Vzhled -> Texty: the organization's own wording of the registration form and parent
// portal texts (src/lib/public-texts.ts). Organization admins.
const publicTextDefaults = () =>
  prisma.translation.findMany({ where: { OR: PUBLIC_TEXT_PREFIXES.map((p) => ({ key: { startsWith: p } })) }, select: { key: true, cs: true }, orderBy: { key: "asc" } });

async function guard() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (!isOrgAdmin(user)) return { error: NextResponse.json({ error: "admin_only" }, { status: 403 }) };
  return { organizationId: await getActingOrgId(user) };
}

async function view(organizationId: string) {
  const [defaults, org] = await Promise.all([publicTextDefaults(), prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { publicTexts: true } })]);
  return { defaults, texts: readPublicTexts(org.publicTexts) };
}

export async function GET() {
  const g = await guard();
  if ("error" in g) return g.error;
  return NextResponse.json(await view(g.organizationId));
}

/** The whole set; a text left out = the default again. */
export async function PUT(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const texts = readPublicTexts(((await req.json().catch(() => ({}))) as { texts?: unknown }).texts);
  await prisma.organization.update({ where: { id: g.organizationId }, data: { publicTexts: Object.keys(texts).length ? texts : Prisma.DbNull } });
  return NextResponse.json(await view(g.organizationId));
}
