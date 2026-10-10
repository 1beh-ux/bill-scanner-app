import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ACTING_ORG_COOKIE, notFound, requireSuperAdmin } from "@/lib/org-scope";
import { invalidatePublicHosts } from "@/lib/public-host";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : undefined);

/** { name?, shortName?, contactEmail?, active? } -- super-admin only; their own home organization can't be deactivated. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const notSuperAdmin = requireSuperAdmin(user);
  if (notSuperAdmin) return notSuperAdmin;
  const { id } = await params;
  if (!(await prisma.organization.findUnique({ where: { id }, select: { id: true } }))) return notFound();
  const body = await req.json().catch(() => ({}));
  const name = text(body.name, 120);
  const shortName = text(body.shortName, 40);
  const contactEmail = text(body.contactEmail, 200);
  if (name === "" || shortName === "") return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  if (typeof body.active === "boolean" && !body.active && id === user.organizationId) {
    return NextResponse.json({ error: "cannot_deactivate_home" }, { status: 400 });
  }
  const org = await prisma.organization.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(shortName !== undefined && { shortName }),
      ...(contactEmail !== undefined && { contactEmail: contactEmail.toLowerCase() || null }),
      ...(typeof body.active === "boolean" && { active: body.active }),
    },
  });
  // Its public hosts go dark (or come back) with it.
  if (typeof body.active === "boolean") invalidatePublicHosts();
  const res = NextResponse.json(org);
  // Deactivated while acting in it: back home.
  if (body.active === false && req.cookies.get(ACTING_ORG_COOKIE)?.value === id) res.cookies.delete(ACTING_ORG_COOKIE);
  return res;
}
