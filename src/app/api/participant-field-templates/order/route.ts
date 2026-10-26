import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId, isOrgAdmin } from "@/lib/org-scope";
import { PROFILE_CATEGORY_KEY, readProfileCategory } from "@/lib/portal-rules";

// Šablony -> Účastníci -> Pořadí polí pro rodiče: each portal field's place (portalSortOrder) and its
// profile section, in one go. Organization admins; the acting organization's templates only.
/** The organization's "Cenová kategorie" placement (the editor's extra row). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const o = await prisma.organization.findUniqueOrThrow({ where: { id: await getActingOrgId(user) }, select: { profileCategory: true } });
  return NextResponse.json({ category: readProfileCategory(o.profileCategory) });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isOrgAdmin(user)) return NextResponse.json({ error: "admin_only" }, { status: 403 });
  const organizationId = await getActingOrgId(user);
  const { items } = (await req.json().catch(() => ({}))) as { items?: unknown };
  if (!Array.isArray(items) || items.length > 500) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  // "Cenová kategorie" (PROFILE_CATEGORY_KEY): not a template -- its place and switch go to the organization.
  const cat = items.findIndex((raw) => (raw as { key?: unknown })?.key === PROFILE_CATEGORY_KEY);
  if (cat >= 0) {
    const o = items[cat] as Record<string, unknown>;
    await prisma.organization.update({ where: { id: organizationId }, data: { profileCategory: readProfileCategory({ show: o.show, section: o.profileSection ?? "basic", order: cat }) } });
  }
  const clean = items.flatMap((raw, i) => {
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (typeof o.key !== "string") return [];
    const section = o.profileSection === null || (typeof o.profileSection === "string" && /^s[a-z0-9]{2,24}$/.test(o.profileSection)) ? (o.profileSection as string | null) : undefined;
    return [{ key: o.key, portalSortOrder: i, profileSection: section }];
  });
  await prisma.$transaction(
    clean.map((c) =>
      prisma.participantFieldTemplate.updateMany({ where: { organizationId, key: c.key }, data: { portalSortOrder: c.portalSortOrder, ...(c.profileSection !== undefined && { profileSection: c.profileSection }) } })
    )
  );
  return NextResponse.json({ ok: true });
}
