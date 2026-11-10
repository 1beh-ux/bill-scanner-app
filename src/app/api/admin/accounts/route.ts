import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireSuperAdmin } from "@/lib/org-scope";

// Aplikace -> Účty (super-admin): every account in every organization -- own organization + role,
// memberships elsewhere, last activity -- the starting point of "Zobrazit jako" across organizations.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const notSuperAdmin = requireSuperAdmin(user);
  if (notSuperAdmin) return notSuperAdmin;
  const users = await prisma.user.findMany({
    orderBy: [{ email: "asc" }],
    select: {
      id: true, email: true, displayName: true, role: true, active: true, isSuperAdmin: true, createdAt: true,
      organization: { select: { id: true, shortName: true, active: true } },
      memberships: { select: { role: true, organization: { select: { id: true, shortName: true, active: true } } } },
    },
  });
  return NextResponse.json(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      active: u.active,
      isSuperAdmin: u.isSuperAdmin,
      createdAt: u.createdAt,
      self: u.id === user.id,
      // The own organization first, then memberships.
      organizations: [{ ...u.organization, role: u.role, own: true }, ...u.memberships.map((m) => ({ ...m.organization, role: m.role, own: false }))],
    }))
  );
}
