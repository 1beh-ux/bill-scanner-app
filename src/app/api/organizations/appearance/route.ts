import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId, isOrgAdmin } from "@/lib/org-scope";
import { cleanAppearance } from "@/lib/public-appearance";

// Organizace -> Vzhled veřejných stránek: the acting organization's public-page look
// (docs/custom-domain.md "Appearance"). Organization admin (a super-admin: where acting).
const SELECT = { publicFontFamily: true, publicHeadingFontFamily: true, publicBaseFontSize: true, publicHeadingScale: true, publicLineHeight: true } as const;

async function guard() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (!isOrgAdmin(user)) return { error: NextResponse.json({ error: "admin_only" }, { status: 403 }) };
  return { organizationId: await getActingOrgId(user) };
}

export async function GET() {
  const g = await guard();
  if ("error" in g) return g.error;
  return NextResponse.json(await prisma.organization.findUniqueOrThrow({ where: { id: g.organizationId }, select: SELECT }));
}

/** The whole set (null / "" = default); "Obnovit výchozí" sends all nulls. */
export async function PATCH(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const data = cleanAppearance(await req.json().catch(() => ({})));
  if (!data) return NextResponse.json({ error: "bad_value" }, { status: 400 });
  return NextResponse.json(await prisma.organization.update({ where: { id: g.organizationId }, data, select: SELECT }));
}
