import { NextResponse } from "next/server";
import type { ListTemplateKind, ModuleKey, User } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

// admin acts as an unrestricted superuser across every module and event
// (same as the rest of this app — user management, category templates,
// exchange rates), and accountant keeps its pre-existing implicit access to
// Bills specifically. Everyone else needs an explicit UserEventModuleAccess
// grant. See docs/bill-scanner-v2-health-module-design.md ("Module registry
// & access").
export async function hasModuleAccess(
  user: User,
  eventId: string,
  moduleKey: ModuleKey
): Promise<boolean> {
  if (user.role === "admin") return true;
  if (user.role === "accountant" && moduleKey === "bills") return true;

  const grant = await prisma.userEventModuleAccess.findUnique({
    where: { userId_eventId_moduleKey: { userId: user.id, eventId, moduleKey } },
  });
  return grant !== null;
}

export async function requireModuleAccess(
  user: User,
  eventId: string,
  moduleKey: ModuleKey
): Promise<NextResponse | null> {
  const ok = await hasModuleAccess(user, eventId, moduleKey);
  if (!ok) {
    return NextResponse.json({ error: "module_access_denied" }, { status: 403 });
  }
  return null;
}

// The generic ListTemplate/EventListItem mechanism (see Milestone 1) is
// shared across modules by `kind`: med/slot/situation are Health's,
// `document` (Mail Helper) belongs to `mail`. Callers must not gate the
// whole route on a single module -- the caller-supplied `kind` decides
// which module's grant is required, so a mail-only volunteer can't reach
// health's med/slot/situation rows (or vice versa) through the same route.
export async function requireListItemAccess(
  user: User,
  eventId: string,
  kind: ListTemplateKind
): Promise<NextResponse | null> {
  const moduleKey: ModuleKey = kind === "document" ? "mail" : "health";
  return requireModuleAccess(user, eventId, moduleKey);
}

export async function getEnabledModules(eventId: string): Promise<ModuleKey[]> {
  const rows = await prisma.eventModule.findMany({
    where: { eventId, enabled: true },
    select: { moduleKey: true },
  });
  return rows.map((r) => r.moduleKey);
}
