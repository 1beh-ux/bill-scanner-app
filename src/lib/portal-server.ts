// Parent portal, server side (docs/registration-portal-spec.md G): resolving
// the token + birth-date cookie, what the portal shows, and the portal
// registration. The portal only mirrors: it never sends e-mail, and shows
// only what the e-mails/documents also carried (payment details appear once
// the acceptance assigned a variable symbol).
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { gateCookieName, gateCookieValid, portalSecret } from "@/lib/portal-gate";
import {
  BUILTIN_PORTAL_ACCESS,
  GUARDIANS_PORTAL_ACCESS,
  GUARDIANS_CHANGE_KEY,
  PROFILE_BUILTINS,
  isEligible,
  profileValues,
  readEligibility,
  type PortalAccessLevel,
} from "@/lib/portal-rules";
import { eligibilityFacts, profileFieldLabels } from "@/lib/child-profile";
import { buildVariableSymbol, effectivePriceCzk, resolvePaymentQrImage } from "@/lib/document-variables";
import { withMembers } from "@/lib/children";
import { documentDisplayName, type DocumentTypeData } from "@/lib/mail-reply-template";
import { fullNameFrom } from "@/lib/participant-name";

const loadChild = (token: string) => prisma.child.findUnique({ where: { portalToken: token }, include: { guardians: true } });
export type PortalChild = NonNullable<Awaited<ReturnType<typeof loadChild>>>;

/**
 * Token -> child, or the error response. Unknown token = a bare 404 (no hint
 * whether it ever existed). `gated`: also require this device's birth-date
 * cookie for the CURRENT token (every data endpoint does).
 */
export async function portalChild(token: string, gated: boolean): Promise<{ child: PortalChild; error?: undefined } | { child?: undefined; error: NextResponse }> {
  const secret = portalSecret();
  if (!secret) return { error: NextResponse.json({ error: "portal_not_configured" }, { status: 503 }) };
  const child = token.length >= 32 ? await loadChild(token) : null;
  if (!child) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  if (gated) {
    const value = (await cookies()).get(gateCookieName(child.id))?.value;
    if (!gateCookieValid(value, child.id, token, secret)) return { error: NextResponse.json({ error: "gate" }, { status: 401 }) };
  }
  return { child };
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

/** Events this child can register for right now: open in the portal, connected (or a membership year), before the deadline, eligible, not registered yet. */
export async function availableEvents(childId: string) {
  const [events, [facts], registered] = await Promise.all([
    prisma.event.findMany({
      where: {
        portalOpen: true,
        status: "active",
        OR: [{ registrationConnected: true }, { kind: "membership" }],
        AND: [{ OR: [{ registrationDeadline: null }, { registrationDeadline: { gte: startOfToday() } }] }],
      },
      orderBy: { startDate: "asc" },
      select: { id: true, name: true, startDate: true, endDate: true, registrationDeadline: true, kind: true, membershipYear: true, eligibility: true },
    }),
    eligibilityFacts([childId]),
    prisma.participant.findMany({ where: { childId }, select: { eventId: true } }),
  ]);
  if (!facts) return [];
  const taken = new Set(registered.map((r) => r.eventId));
  return events
    .filter((e) => !taken.has(e.id) && isEligible(readEligibility(e.eligibility), facts))
    .map((e) => ({ id: e.id, name: e.name, startDate: e.startDate, endDate: e.endDate, registrationDeadline: e.registrationDeadline, kind: e.kind, membershipYear: e.membershipYear }));
}

/** Everything the portal shows for one child (after the gate). */
export async function portalData(child: PortalChild) {
  const [templates, labels, pending, available, participations] = await Promise.all([
    visibleTemplates(),
    profileFieldLabels(),
    prisma.childChange.findMany({ where: { childId: child.id, status: "pending" } }),
    availableEvents(child.id),
    prisma.participant.findMany({
      where: { childId: child.id },
      include: { event: true, guardians: true, documents: { where: { gcsPath: { not: null } }, include: { eventListItem: true }, orderBy: { receivedAt: "desc" } } },
      orderBy: { event: { startDate: "desc" } },
    }),
  ]);
  const values = profileValues(child);
  const pendingBy = new Map(pending.map((c) => [c.fieldKey, c.newValue ?? ""]));
  const field = (key: string, access: PortalAccessLevel, fieldType: string, options: unknown) => ({
    key,
    label: labels[key] ?? key,
    access,
    fieldType,
    options,
    value: values[key] ?? "",
    pending: pendingBy.has(key) ? pendingBy.get(key)! : null,
  });

  const today = startOfToday();
  const isCurrent = (e: { status: string; endDate: Date }) => e.status === "active" && e.endDate >= today;
  const registrations = [];
  for (const p of participations) {
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

  return {
    child: { name: child.name },
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
    available,
    registrations,
    history: participations
      .filter((p) => !isCurrent(p.event))
      .map((p) => ({ id: p.id, name: p.event.name, startDate: p.event.startDate, endDate: p.event.endDate, kind: p.event.kind, membershipYear: p.event.membershipYear, status: p.registrationStatus })),
  };
}

/**
 * Portal "Přihlásit": a PENDING participant in the event, filled from the
 * profile's live values (pending changes don't count yet) for the keys the
 * event has, plus guardians, childId and the parent's note. The admin accepts
 * exactly as for any other participant. Null = not available to this child
 * (closed, not eligible, past deadline or already registered).
 */
export async function registerFromPortal(child: PortalChild, eventId: string, note: string): Promise<{ id: string } | null> {
  if (!(await availableEvents(child.id)).some((e) => e.id === eventId)) return null;
  const fields = await prisma.eventParticipantField.findMany({ where: { eventId, active: true, kind: "custom" }, select: { key: true } });
  const values = profileValues(child);
  const customFieldValues = Object.fromEntries(fields.filter((f) => values[f.key]).map((f) => [f.key, values[f.key]]));
  // ponytail: availableEvents' duplicate check and this create aren't atomic --
  // a double-click race could register twice; the admin sees and deletes the extra row.
  return prisma.participant.create({
    data: {
      eventId,
      childId: child.id,
      name: fullNameFrom(child.firstName, child.lastName) || child.name,
      firstName: child.firstName,
      lastName: child.lastName,
      dateOfBirth: child.dateOfBirth,
      customFieldValues,
      portalNote: note.trim().slice(0, 2000) || null,
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
