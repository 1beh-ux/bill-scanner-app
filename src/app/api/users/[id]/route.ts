import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isOrgAdmin, notFound, orgWhere, requireSuperAdmin } from "@/lib/org-scope";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isOrgAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  // Only a user of the acting organization; anyone else doesn't exist here.
  const target = await prisma.user.findFirst({ where: { id, ...(await orgWhere(user)) }, select: { role: true, active: true, organizationId: true } });
  if (!target) return notFound();
  // Only these three; isSuperAdmin (and the organization) are never editable through the API.
  const body = await req.json();
  const { displayName, role, active } = body;

  if (active === false && id === user.id) {
    return NextResponse.json({ error: "cannot_deactivate_self" }, { status: 400 });
  }
  if (role !== undefined && role !== "admin" && role !== "accountant" && role !== "user") {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }
  if (role !== undefined && role !== "admin" && id === user.id) {
    return NextResponse.json({ error: "cannot_demote_self" }, { status: 400 });
  }
  // Granting or removing admin: super-admin only (organizations step 3).
  if (role !== undefined && role !== target.role && (role === "admin" || target.role === "admin")) {
    const notSuperAdmin = requireSuperAdmin(user);
    if (notSuperAdmin) return notSuperAdmin;
  }
  // The organization keeps at least one active admin (deactivating or demoting the last one).
  const losesAdmin = target.role === "admin" && target.active && (active === false || (role !== undefined && role !== "admin"));
  if (losesAdmin && (await prisma.user.count({ where: { organizationId: target.organizationId, role: "admin", active: true } })) <= 1) {
    return NextResponse.json({ error: "last_admin" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(displayName !== undefined && { displayName }),
      ...(role !== undefined && { role }),
      ...(active !== undefined && { active }),
    },
  });

  return NextResponse.json(updated);
}