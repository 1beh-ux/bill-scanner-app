import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId, isOrgAdmin } from "@/lib/org-scope";
import { cleanAppearance, cleanLayer, readLayer } from "@/lib/public-appearance";

// Organizace -> Vzhled veřejných stránek: the acting organization's public-page look
// (docs/custom-domain.md "Appearance"). base = the parent portal (the columns); embed / registration =
// partial layers over it (src/lib/public-appearance.ts pageAppearance). Organization admin (a super-admin: where acting).
const SELECT = {
  publicFontFamily: true,
  publicHeadingFontFamily: true,
  publicBaseFontSize: true,
  publicHeadingScale: true,
  publicLineHeight: true,
  publicTheme: true,
  publicTransparent: true,
  publicContentWidth: true,
  appearanceEmbed: true,
  appearanceRegistration: true,
} as const;

async function guard(): Promise<{ error: NextResponse } | { organizationId: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (!isOrgAdmin(user)) return { error: NextResponse.json({ error: "admin_only" }, { status: 403 }) };
  return { organizationId: await getActingOrgId(user) };
}

async function view(organizationId: string) {
  const { appearanceEmbed, appearanceRegistration, ...base } = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: SELECT });
  return { base, embed: readLayer(appearanceEmbed), registration: readLayer(appearanceRegistration) };
}

export async function GET() {
  const g = await guard();
  if ("error" in g) return g.error;
  return NextResponse.json(await view(g.organizationId));
}

/** { layer: "base", values } = the whole base set (null / "" = default); { layer: "embed" | "registration", values } = that layer (missing keys inherit). */
export async function PATCH(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const { layer, values } = (await req.json().catch(() => ({}))) as { layer?: string; values?: unknown };
  if (layer === "base") {
    const data = cleanAppearance((values ?? {}) as Record<string, unknown>);
    if (!data) return NextResponse.json({ error: "bad_value" }, { status: 400 });
    await prisma.organization.update({ where: { id: g.organizationId }, data });
  } else if (layer === "embed" || layer === "registration") {
    const l = cleanLayer(values);
    if (!l) return NextResponse.json({ error: "bad_value" }, { status: 400 });
    const json = Object.keys(l).length ? (l as Prisma.InputJsonObject) : Prisma.DbNull;
    await prisma.organization.update({ where: { id: g.organizationId }, data: layer === "embed" ? { appearanceEmbed: json } : { appearanceRegistration: json } });
  } else return NextResponse.json({ error: "bad_value" }, { status: 400 });
  return NextResponse.json(await view(g.organizationId));
}
