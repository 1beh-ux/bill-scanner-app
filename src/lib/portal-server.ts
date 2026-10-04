// Parent portal, server side (docs/registration-portal-spec.md G, slice 3 B):
// resolving the token + birth-date cookie, what the portal shows, and the
// portal registration. A token is either a child's (that child only) or a
// family's (every member). The portal only mirrors: it shows only what the
// e-mails/documents also carried (payment details appear once the acceptance
// assigned a variable symbol).
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { gateCookieName, gateCookieValid, portalSecret } from "@/lib/portal-gate";
import {
  BUILTIN_PORTAL_ACCESS,
  GUARDIANS_PORTAL_ACCESS,
  GUARDIANS_CHANGE_KEY,
  PROFILE_BUILTINS,
  familyContacts,
  isEligible,
  profileValues,
  readEligibility,
  type PortalAccessLevel,
} from "@/lib/portal-rules";
import { eligibilityFacts, profileFieldLabels } from "@/lib/child-profile";
import { buildVariableSymbol, effectivePriceCzk, isMember, resolvePaymentQrImage } from "@/lib/document-variables";
import { allowedCategories, categoryFor, readPriceRules, type PriceRules } from "@/lib/price-rules";
import { withMembers } from "@/lib/children";
import { documentDisplayName, type DocumentTypeData } from "@/lib/mail-reply-template";
import { fullNameFrom } from "@/lib/participant-name";

const loadChild = (token: string) => prisma.child.findUnique({ where: { portalToken: token }, include: { guardians: true } });
export type PortalChild = NonNullable<Awaited<ReturnType<typeof loadChild>>>;

/** Who a portal link shows: one child (child token) or every member of a family (family token). */
export type PortalScope = {
  kind: "child" | "family";
  id: string;
  // Cookie name + HMAC subject: the child id (as in slice 2), or "f_<familyId>".
  subject: string;
  name: string;
  members: PortalChild[];
  gateFailures: number;
  gateWindowStart: Date | null;
};

/** Token -> scope, or null. Child tokens first (existing links keep working). */
export async function loadScope(token: string): Promise<PortalScope | null> {
  if (token.length < 32) return null;
  const child = await loadChild(token);
  if (child) {
    return { kind: "child", id: child.id, subject: child.id, name: child.name, members: [child], gateFailures: child.portalGateFailures, gateWindowStart: child.portalGateWindowStart };
  }
  const family = await prisma.family.findUnique({
    where: { portalToken: token },
    include: { members: { include: { guardians: true }, orderBy: [{ isAdult: "desc" }, { dateOfBirth: "asc" }, { name: "asc" }] } },
  });
  if (!family || family.members.length === 0) return null;
  return {
    kind: "family",
    id: family.id,
    subject: `f_${family.id}`,
    name: family.name,
    members: family.members,
    gateFailures: family.portalGateFailures,
    gateWindowStart: family.portalGateWindowStart,
  };
}

/**
 * Token -> scope, or the error response. Unknown token = a bare 404 (no hint
 * whether it ever existed). `gated`: also require this device's birth-date
 * cookie for the CURRENT token (every data endpoint does).
 */
export async function portalScope(token: string, gated: boolean): Promise<{ scope: PortalScope; error?: undefined } | { scope?: undefined; error: NextResponse }> {
  const secret = portalSecret();
  if (!secret) return { error: NextResponse.json({ error: "portal_not_configured" }, { status: 503 }) };
  const scope = await loadScope(token);
  if (!scope) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  if (gated) {
    const value = (await cookies()).get(gateCookieName(scope.subject))?.value;
    if (!gateCookieValid(value, scope.subject, token, secret)) return { error: NextResponse.json({ error: "gate" }, { status: 401 }) };
  }
  return { scope };
}

/** The member a request is about: `memberId` must be in the scope; a one-person scope needs none. */
export function scopeMember(scope: PortalScope, memberId: unknown): PortalChild | null {
  if (typeof memberId === "string") return scope.members.find((m) => m.id === memberId) ?? null;
  return scope.members.length === 1 ? scope.members[0] : null;
}

/** Stores the gate throttle counter on the child or the family. */
export async function saveGateThrottle(scope: PortalScope, failures: number, windowStart: Date | null): Promise<void> {
  const data = { portalGateFailures: failures, portalGateWindowStart: windowStart };
  if (scope.kind === "child") await prisma.child.update({ where: { id: scope.id }, data });
  else await prisma.family.update({ where: { id: scope.id }, data });
}

/** Org fields a parent may see, with their access level (hidden + inactive ones never leave the server). */
async function visibleTemplates() {
  const templates = await prisma.participantFieldTemplate.findMany({ where: { active: true, portalAccess: { not: "hidden" } }, orderBy: { label: "asc" } });
  return templates;
}

/** Access level per profile key a parent may touch (built-ins + visible org fields). */
export async function portalAccessMap(): Promise<Map<string, PortalAccessLevel>> {
  const map = new Map<string, PortalAccessLevel>(Object.keys(PROFILE_BUILTINS).map((k) => [k, BUILTIN_PORTAL_ACCESS]));
  for (const t of await visibleTemplates()) map.set(t.key, t.portalAccess);
  return map;
}

const startOfToday = () => new Date(new Date().toISOString().slice(0, 10));

/**
 * Events open for registration right now -- open in the portal, connected (or
 * a membership year), before the deadline -- each with the members who may
 * still register (eligible, not registered yet). Events nobody can take are left out.
 */
export async function availableEvents(memberIds: string[]) {
  const [events, facts, registered] = await Promise.all([
    prisma.event.findMany({
      where: {
        portalOpen: true,
        status: "active",
        OR: [{ registrationConnected: true }, { kind: "membership" }],
        AND: [{ OR: [{ registrationDeadline: null }, { registrationDeadline: { gte: startOfToday() } }] }],
      },
      orderBy: { startDate: "asc" },
    }),
    eligibilityFacts(memberIds),
    prisma.participant.findMany({ where: { childId: { in: memberIds } }, select: { eventId: true, childId: true } }),
  ]);
  const taken = new Set(registered.map((r) => `${r.eventId}:${r.childId}`));
  return events
    .map((e) => ({ event: e, memberIds: facts.filter((f) => !taken.has(`${e.id}:${f.childId}`) && isEligible(readEligibility(e.eligibility), f)).map((f) => f.childId) }))
    .filter((a) => a.memberIds.length > 0);
}

/** Everything the portal shows for a scope (after the gate). */
export async function portalData(scope: PortalScope) {
  const memberIds = scope.members.map((m) => m.id);
  const [templates, labels, pending, available, participations] = await Promise.all([
    visibleTemplates(),
    profileFieldLabels(),
    prisma.childChange.findMany({ where: { childId: { in: memberIds }, status: "pending" } }),
    availableEvents(memberIds),
    prisma.participant.findMany({
      where: { childId: { in: memberIds } },
      include: { event: true, guardians: true, documents: { where: { gcsPath: { not: null } }, include: { eventListItem: true }, orderBy: { receivedAt: "desc" } } },
      orderBy: { event: { startDate: "desc" } },
    }),
  ]);

  const today = startOfToday();
  const isCurrent = (e: { status: string; endDate: Date }) => e.status === "active" && e.endDate >= today;

  const members = [];
  for (const child of scope.members) {
    const values = profileValues(child);
    const pendingBy = new Map(pending.filter((c) => c.childId === child.id).map((c) => [c.fieldKey, c.newValue ?? ""]));
    const field = (key: string, access: PortalAccessLevel, fieldType: string, options: unknown) => ({
      key,
      label: labels[key] ?? key,
      access,
      fieldType,
      options,
      value: values[key] ?? "",
      pending: pendingBy.has(key) ? pendingBy.get(key)! : null,
    });
    const own = participations.filter((p) => p.childId === child.id);

    const registrations = [];
    for (const p of own) {
      const e = p.event;
      // Upcoming/current registrations only of events using the module; the rest is history.
      if (!isCurrent(e) || !(e.registrationConnected || e.kind === "membership")) continue;
      let payment = null;
      if (p.registrationStatus === "accepted" && p.registrationNumber != null) {
        const event = await withMembers(e);
        const forMerge = { ...p, customFieldValues: p.customFieldValues as Record<string, string> | null };
        const qr = await resolvePaymentQrImage(forMerge, event);
        payment = {
          priceCzk: effectivePriceCzk(forMerge, event),
          account: e.registrationBankAccountNumber && e.registrationBankCode ? `${e.registrationBankAccountNumber}/${e.registrationBankCode}` : null,
          variableSymbol: buildVariableSymbol(forMerge, event),
          qrDataUrl: qr ? `data:image/png;base64,${qr.toString("base64")}` : null,
        };
      }
      registrations.push({
        participantId: p.id,
        event: { name: e.name, startDate: e.startDate, endDate: e.endDate, kind: e.kind, membershipYear: e.membershipYear },
        status: p.registrationStatus,
        note: p.portalNote,
        payment,
        documents: p.documents.map((d) => ({
          id: d.id,
          name: documentDisplayName({ ...d.eventListItem, data: d.eventListItem.data as DocumentTypeData | null }),
          // generated = we sent it to you; anything else = received from you
          sentToParent: d.receivedVia === "generated",
          date: d.receivedAt,
        })),
      });
    }

    members.push({
      id: child.id,
      name: child.name,
      isAdult: child.isAdult,
      profile: {
        fields: [
          ...Object.keys(PROFILE_BUILTINS).map((k) => field(k, BUILTIN_PORTAL_ACCESS, k === "datum_narozeni" ? "date" : "text", null)),
          ...templates.map((t) => field(t.key, t.portalAccess, t.fieldType, t.options)),
        ],
        guardians: child.guardians.map((g) => ({ name: g.name, email: g.email, relationship: g.relationship, phone: g.phone, receivesCommunications: g.receivesCommunications })),
        // The parent's proposed list while it waits for approval (live list above still gets the e-mails).
        guardiansPending: pendingBy.has(GUARDIANS_CHANGE_KEY) ? JSON.parse(pendingBy.get(GUARDIANS_CHANGE_KEY)!) : null,
        guardiansAccess: GUARDIANS_PORTAL_ACCESS,
      },
      registrations,
      history: own
        .filter((p) => !isCurrent(p.event))
        .map((p) => ({ id: p.id, name: p.event.name, startDate: p.event.startDate, endDate: p.event.endDate, kind: p.event.kind, membershipYear: p.event.membershipYear, status: p.registrationStatus })),
    });
  }

  return {
    kind: scope.kind,
    name: scope.name,
    members,
    // A family's contacts, each once (an adult member's own e-mail = that member).
    contacts: scope.kind === "family" ? familyContacts(scope.members).map((g) => ({ name: g.name, email: g.email, phone: g.phone, member: g.member })) : [],
    available: await Promise.all(
      available.map(async ({ event: e, memberIds }) => ({
        id: e.id,
        name: e.name,
        startDate: e.startDate,
        endDate: e.endDate,
        registrationDeadline: e.registrationDeadline,
        kind: e.kind,
        membershipYear: e.membershipYear,
        memberIds,
        pricing: await registrationPricing(e, scope.members.filter((m) => memberIds.includes(m.id))),
      }))
    ),
  };
}

/** The event's "Oddíl" select (price rules oddilFieldKey), when the event has that field. */
async function oddilField(eventId: string, rules: PriceRules | null) {
  if (!rules?.oddilFieldKey) return null;
  const f = await prisma.eventParticipantField.findFirst({ where: { eventId, key: rules.oddilFieldKey, active: true, fieldType: "select" } });
  const options = Array.isArray(f?.options) ? f.options.filter((o): o is string => typeof o === "string") : [];
  return f && options.length ? { key: f.key, label: f.label, options } : null;
}

/**
 * What the registration form needs for the live price (src/lib/price-rules.ts
 * previewPrices): the rules (or today's two prices), how many of the household
 * are already registered, and per member whether they count as a member and
 * which categories they may pick. The stored price is computed live later.
 */
async function registrationPricing(
  e: Awaited<ReturnType<typeof prisma.event.findUniqueOrThrow>>,
  members: PortalChild[]
) {
  const rules = readPriceRules(e.priceRules);
  const event = await withMembers(e);
  const familyId = members[0]?.familyId ?? null;
  const alreadyRegistered = familyId ? await prisma.participant.count({ where: { eventId: e.id, active: true, child: { familyId } } }) : 0;
  return {
    rules,
    memberPriceCzk: e.memberPriceCzk,
    nonMemberPriceCzk: e.nonMemberPriceCzk,
    eventStart: e.startDate,
    alreadyRegistered,
    inFamily: !!familyId,
    oddil: await oddilField(e.id, rules),
    members: members.map((m) => ({
      id: m.id,
      isAdult: m.isAdult,
      // As if registered now with the profile's values (manual membership field / confirmed membership).
      isMember: isMember({ name: m.name, groupName: null, dateOfBirth: m.dateOfBirth, registrationStatus: "pending", customFieldValues: profileValues(m), registrationNumber: null, guardians: [], childId: m.id }, event),
      categories: rules ? allowedCategories(rules, m.isAdult).map((c) => ({ key: c.key, label: c.label, asksOddil: !!c.asksOddil })) : [],
    })),
  };
}

export type RegistrationPick = { memberId: string; priceCategory?: unknown; oddil?: unknown };

/** A pick's category (null without rules) + the Oddíl value when its category asks for it (null = invalid pick). */
export async function pickExtras(eventId: string, priceRules: unknown, isAdult: boolean, pick: { priceCategory?: unknown; oddil?: unknown }) {
  const rules = readPriceRules(priceRules);
  if (!rules) return { priceCategory: null, values: {} };
  const cat = categoryFor(rules, typeof pick.priceCategory === "string" ? pick.priceCategory : null, isAdult);
  if (!cat) return null;
  const oddil = cat.asksOddil ? await oddilField(eventId, rules) : null;
  if (oddil && !(typeof pick.oddil === "string" && oddil.options.includes(pick.oddil))) return null;
  return { priceCategory: cat.key, values: oddil ? { [oddil.key]: pick.oddil as string } : {} };
}

/**
 * One PENDING participant of `child` in the event, filled from the profile's
 * live values (pending changes don't count yet) for the keys the event has,
 * plus guardians, childId and the parent's note. The admin accepts exactly as
 * for any other participant (unless the event auto-accepts, slice 3 E).
 * Shared by the portal and the public registration form.
 */
export async function createRegistration(
  child: PortalChild,
  eventId: string,
  opts: { note?: string; priceCategory?: string | null; values?: Record<string, string> }
): Promise<{ id: string }> {
  const fields = await prisma.eventParticipantField.findMany({ where: { eventId, active: true, kind: "custom" }, select: { key: true } });
  const values = { ...profileValues(child), ...opts.values };
  const customFieldValues = Object.fromEntries(fields.filter((f) => values[f.key]).map((f) => [f.key, values[f.key]]));
  return prisma.participant.create({
    data: {
      eventId,
      childId: child.id,
      name: fullNameFrom(child.firstName, child.lastName) || child.name,
      firstName: child.firstName,
      lastName: child.lastName,
      dateOfBirth: child.dateOfBirth,
      customFieldValues,
      portalNote: opts.note?.trim().slice(0, 2000) || null,
      priceCategory: opts.priceCategory ?? null,
      guardians: {
        create: child.guardians.map((g) => ({
          name: g.name,
          email: g.email,
          relationship: g.relationship,
          phone: g.phone,
          receivesCommunications: g.receivesCommunications,
        })),
      },
    },
    select: { id: true },
  });
}

/**
 * Portal "Přihlásit": the picked members of the scope -> pending
 * participants. Only members the event is available to (open, eligible,
 * before the deadline, not registered yet); null = none of the picks was.
 */
export async function registerFromPortal(scope: PortalScope, eventId: string, picks: RegistrationPick[], note: string): Promise<{ ids: string[] } | null> {
  const open = (await availableEvents(scope.members.map((m) => m.id))).find((a) => a.event.id === eventId);
  if (!open) return null;
  const chosen = [];
  for (const m of scope.members) {
    const pick = picks.find((p) => p.memberId === m.id);
    if (!pick || !open.memberIds.includes(m.id)) continue;
    const extras = await pickExtras(eventId, open.event.priceRules, m.isAdult, pick);
    if (!extras) return null;
    chosen.push({ child: m, extras });
  }
  if (chosen.length === 0) return null;
  const ids: string[] = [];
  // ponytail: availableEvents' duplicate check and these creates aren't atomic --
  // a double-click race could register twice; the admin sees and deletes the extra row.
  for (const { child, extras } of chosen) ids.push((await createRegistration(child, eventId, { note, ...extras })).id);
  return { ids };
}
