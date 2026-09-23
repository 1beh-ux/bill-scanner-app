import { NextResponse } from "next/server";
import type { ListTemplateKind, ModuleKey, User } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

// admin acts as an unrestricted superuser across every module and event
// (same as the rest of this app -- user management, category templates,
// exchange rates). Everyone else -- `user` and `accountant` alike; the latter
// is only a label now, it carries no implicit privileges -- needs an explicit
// UserEventModuleAccess grant per event and module. See
// docs/bill-scanner-v2-health-module-design.md ("Module registry & access")
// and docs/drive-payers-roles-change-notes.md.
export async function hasModuleAccess(
  user: User,
  eventId: string,
  moduleKey: ModuleKey
): Promise<boolean> {
  if (user.role === "admin") return true;

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
// `document` (Mail Helper) belongs to `mail`, `plan_*` to `planning`. Callers must not gate the
// whole route on a single module -- the caller-supplied `kind` decides
// which module's grant is required, so a mail-only volunteer can't reach
// health's med/slot/situation rows (or vice versa) through the same route.
export async function requireListItemAccess(
  user: User,
  eventId: string,
  kind: ListTemplateKind
): Promise<NextResponse | null> {
  const moduleKey: ModuleKey =
    kind === "document" ? "mail" : kind.startsWith("plan_") ? "planning" : "health";
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
 * longer keep health-only field values away from a mail-only reader the
 * way separate typed columns used to (see /api/participants/[id]/core's
 * own comment on this exact boundary). This is the shared filter.
 *
 * Gated by whether the MODULE IS ENABLED FOR THE EVENT, not by which of
 * health/mail the calling user personally has a grant for (changed from
 * the original per-user-grant gate -- see the participants/settings/
 * Health/Mail prompt, Part 4: "the central roster is the main list for
 * seeing all information enabled for the event"; reaching the roster at
 * all already required a health-or-mail grant via requireAnyModuleAccess,
 * so a mail-only user sees health fields too once Health is on, and vice
 * versa). A field surfaced only for health (health_list/health_detail)
 * needs Health enabled for the event; one surfaced only for mail_list
 * needs Mail enabled; a field carrying the general `list` surface (or no
 * surfaces at all -- not yet configured) is always visible to anyone who
 * reached the central roster. Applies to admin too: with Health off for
 * an event there's no Health screen to show these fields in anyway.
 */
export async function allowedParticipantFieldKeys(
  user: User,
  eventId: string
): Promise<Set<string>> {
  const enabledModules = new Set(await getEnabledModules(eventId));

  const fields = await prisma.eventParticipantField.findMany({
    where: { eventId },
    select: { key: true, surfaces: true },
  });

  const allowed = new Set<string>();
  for (const f of fields) {
    // `documents`/`import` are orthogonal to which screen shows a field --
    // ignore them here so a field that's health_detail-only but also
    // document-mergeable doesn't leak just because it has a second surface.
    const gateSurfaces = f.surfaces.filter((s) => s !== "documents" && s !== "import");
    const isHealthOnly = gateSurfaces.length > 0 && gateSurfaces.every((s) => s === "health_list" || s === "health_detail");
    const isMailOnly = gateSurfaces.length > 0 && gateSurfaces.every((s) => s === "mail_list");
    if (isHealthOnly && !enabledModules.has("health")) continue;
    if (isMailOnly && !enabledModules.has("mail")) continue;
    allowed.add(f.key);
  }
  return allowed;
}
