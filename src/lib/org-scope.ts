// Organizations step 2 (docs/organizations-change-notes.md): every request acts
// inside ONE organization. Ordinary users: their own, always. Super-admin: the
// `acting_org` cookie (switcher in step 3) when it names an active organization,
// else their own. Something outside the acting organization is "not found"
// (404), never "forbidden" -- its existence isn't revealed.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Event, User } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const ACTING_ORG_COOKIE = "acting_org";

type ScopeUser = Pick<User, "organizationId" | "isSuperAdmin">;

export async function getActingOrgId(user: ScopeUser): Promise<string> {
  if (!user.isSuperAdmin) return user.organizationId;
  const wanted = (await cookies()).get(ACTING_ORG_COOKIE)?.value;
  if (!wanted || wanted === user.organizationId) return user.organizationId;
  const org = await prisma.organization.findFirst({ where: { id: wanted, active: true }, select: { id: true } });
  return org?.id ?? user.organizationId;
}

export const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });

/** The event if it's in the acting organization, else a 404 response. */
export async function requireEventInOrg(user: ScopeUser, eventId: string): Promise<{ error: NextResponse } | { event: Event }> {
  const event = typeof eventId === "string" && eventId ? await prisma.event.findUnique({ where: { id: eventId } }) : null;
  if (!event || event.organizationId !== (await getActingOrgId(user))) return { error: notFound() };
  return { event };
}

/** Is the event in the acting organization? (For code that only needs yes/no.) */
export async function eventInOrg(user: ScopeUser, eventId: string): Promise<boolean> {
  return "event" in (await requireEventInOrg(user, eventId));
}

/**
 * Admin of the acting organization. An ordinary user always acts in their own
 * organization, so this is their role; a super-admin is admin wherever they act.
 */
export const isOrgAdmin = (user: Pick<User, "role" | "isSuperAdmin">) => user.isSuperAdmin || user.role === "admin";

/** 403 unless super-admin (Překlady, Kurzy, Veřejné adresy). */
export const requireSuperAdmin = (user: Pick<User, "isSuperAdmin">): NextResponse | null =>
  user.isSuperAdmin ? null : NextResponse.json({ error: "super_admin_only" }, { status: 403 });

/** `where` fragment for org-owned tables: the acting organization's rows. */
export async function orgWhere(user: ScopeUser) {
  return { organizationId: await getActingOrgId(user) };
}

/** Signed-in admin of the acting organization, and the event is in it -- for admin-only event routes. */
export async function requireOrgAdminEvent(eventId: string): Promise<{ error: NextResponse } | { user: User; event: Event }> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (!isOrgAdmin(user)) return { error: NextResponse.json({ error: "admin_only" }, { status: 403 }) };
  const inOrg = await requireEventInOrg(user, eventId);
  if ("error" in inOrg) return inOrg;
  return { user, event: inOrg.event };
}

/** Is this payer (Author) the acting organization's? */
export async function authorInOrg(user: ScopeUser, id: string): Promise<boolean> {
  return (await prisma.author.count({ where: { id, organizationId: await getActingOrgId(user) } })) > 0;
}

/** Is this person (Child) the acting organization's? */
export async function childInOrg(user: ScopeUser, id: string): Promise<boolean> {
  return (await prisma.child.count({ where: { id, organizationId: await getActingOrgId(user) } })) > 0;
}
