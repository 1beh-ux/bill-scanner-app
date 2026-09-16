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

// For routes shared between two modules against the same underlying data
// (the mailbox OAuth flow and Event.senderEmail are now used by both Health
// and Mail Helper against the same MailSenderAccount/Event fields) -- access
// via any one of the listed modules is sufficient.
export async function requireAnyModuleAccess(
  user: User,
  eventId: string,
  moduleKeys: ModuleKey[]
): Promise<NextResponse | null> {
  for (const moduleKey of moduleKeys) {
    if (await hasModuleAccess(user, eventId, moduleKey)) return null;
  }
  return NextResponse.json({ error: "module_access_denied" }, { status: 403 });
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

/**
 * Every custom participant field now lives in one shared JSON blob
 * (Participant.customFieldValues), which means the DB query alone can no
 * longer keep health-only field values away from a mail-only grant the
 * way separate typed columns used to (see /api/participants/[id]/core's
 * own comment on this exact boundary). This is the shared filter: a
 * field surfaced only for health (health_list/health_detail) requires
 * health access; a field surfaced for mail_list requires mail access;
 * a field carrying the general `list` surface (or no surfaces at all --
 * not yet configured) is visible to anyone who reached the central
 * roster at all, i.e. has health or mail. Called from every route that
 * reads or writes customFieldValues for a mixed health-or-mail-gated
 * page (the central roster and its supporting endpoints).
 */
export async function allowedParticipantFieldKeys(
  user: User,
  eventId: string
): Promise<Set<string>> {
  if (user.role === "admin") {
    const all = await prisma.eventParticipantField.findMany({ where: { eventId }, select: { key: true } });
    return new Set(all.map((f) => f.key));
  }

  const [hasHealth, hasMail] = await Promise.all([
    hasModuleAccess(user, eventId, "health"),
    hasModuleAccess(user, eventId, "mail"),
  ]);

  const fields = await prisma.eventParticipantField.findMany({
    where: { eventId },
    select: { key: true, surfaces: true },
  });

  const allowed = new Set<string>();
  for (const f of fields) {
    const isHealthOnly = f.surfaces.every((s) => s === "health_list" || s === "health_detail");
    const isMailOnly = f.surfaces.length > 0 && f.surfaces.every((s) => s === "mail_list");
    if (isHealthOnly && !hasHealth) continue;
    if (isMailOnly && !hasMail) continue;
    allowed.add(f.key);
  }
  return allowed;
}
