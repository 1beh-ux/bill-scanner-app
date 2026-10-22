import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId, isOrgAdmin } from "@/lib/org-scope";
import { readProfileSections } from "@/lib/portal-rules";

// The parent portal profile's own sections (after Základní / Podrobné údaje), Šablony -> Účastníci.
// Reading: anyone in the organization (the field table shows them); changing: organization admins.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: await getActingOrgId(user) }, select: { portalProfileSections: true } });
  return NextResponse.json({ sections: readProfileSections(org.portalProfileSections) });
}

/** The whole list in order; a section left out is gone (its fields go back by their level). */
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isOrgAdmin(user)) return NextResponse.json({ error: "admin_only" }, { status: 403 });
  const { sections } = (await req.json().catch(() => ({}))) as { sections?: unknown };
  const clean = readProfileSections(sections);
  await prisma.organization.update({ where: { id: await getActingOrgId(user) }, data: { portalProfileSections: clean } });
  return NextResponse.json({ sections: clean });
}
