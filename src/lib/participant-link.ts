// The participant's own page /u/<token> (2026-10-23, redone 2026-10-25): for a registration NOT linked to a
// person in Členové (a public registration of an "existing people only" event, an import, a manual add)
// -- the same registration card as the parent portal (src/lib/portal-server.ts registrationCard: card
// layout, payment + bank check, documents, re-send, "Doplňte údaje"), for that one event only, no profile.
// The same birth-date gate as the portal: a signed cookie (or x-portal-gate in a frame) per participant.
// {{details_link}} in e-mails: the family portal when the person is linked, else this page.
import crypto from "crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hostAllowsPortal, publicUrl, resolvePublicHost } from "@/lib/public-host";
import { adultAt } from "@/lib/children";
import { askedFields, askedLater, askedMissing, checkAnswers } from "@/lib/registration-fields";
import { birthDateMatches } from "@/lib/portal-rules";
import { registrationCard, requiredEventFields, templateRules } from "@/lib/portal-server";
import { gateCookieName, gateCookieValid, portalSecret } from "@/lib/portal-gate";

/** The page's address for a participant (made on a real send: `create`), "" when there's none. */
export async function participantLinkUrl(participantId: string, create: boolean): Promise<string> {
  const p = await prisma.participant.findUnique({ where: { id: participantId }, select: { detailsToken: true, event: { select: { organizationId: true } } } });
  if (!p) return "";
  let token = p.detailsToken;
  if (!token && create) {
    token = crypto.randomBytes(18).toString("base64url");
    await prisma.participant.update({ where: { id: participantId }, data: { detailsToken: token } });
  }
  if (!token) return create ? "" : "https://…/u/…";
  return (await publicUrl("portal", null, `/u/${token}`, p.event.organizationId)) ?? "";
}

const loadByToken = (token: string) =>
  token && token.length <= 64 ? prisma.participant.findUnique({ where: { detailsToken: token }, include: { event: true, guardians: true, documents: true } }) : Promise.resolve(null);
export type LinkParticipant = NonNullable<Awaited<ReturnType<typeof loadByToken>>>;

/** Gate cookie subject of a participant's page (never a person's / family's). */
export const participantGateSubject = (participantId: string) => `u_${participantId}`;
export const GATE_FAILURES_PER_HOUR = 10;

/**
 * Every /api/public/u route: the token's participant in an active event, on a portal host of its
 * organization; `gated` = the birth-date gate passed (cookie, or x-portal-gate when embedded).
 */
export async function participantScope(token: string, gated: boolean): Promise<{ p: LinkParticipant; error?: undefined } | { p?: undefined; error: NextResponse }> {
  const secret = portalSecret();
  if (!secret) return { error: NextResponse.json({ error: "portal_not_configured" }, { status: 503 }) };
  const p = await loadByToken(token);
  if (!p || p.event.status !== "active" || !hostAllowsPortal(await resolvePublicHost(await headers()), p.event.organizationId)) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  if (gated) {
    const subject = participantGateSubject(p.id);
    const value = (await cookies()).get(gateCookieName(subject))?.value ?? (await headers()).get("x-portal-gate") ?? undefined;
    if (!gateCookieValid(value, subject, token, secret)) return { error: NextResponse.json({ error: "gate" }, { status: 401 }) };
  }
  return { p };
}

/** The birth date typed at the gate: true = right. No birth date on the registration = always right. */
export const birthDatePasses = (p: LinkParticipant, birthDate: unknown) => !p.dateOfBirth || birthDateMatches(typeof birthDate === "string" ? birthDate : null, p.dateOfBirth);

/**
 * What the page asks (the portal's rules, src/lib/registration-fields.ts): two-step events after acceptance
 * the detailed fields + the event's questions ("Doplňte údaje"); otherwise every field the event requires
 * (an import or a manual add never answered them). The org's field order, for this person's age group.
 */
async function askedFor(p: LinkParticipant) {
  const [eventFields, rules] = await Promise.all([requiredEventFields([p.eventId]), templateRules(p.event.organizationId)]);
  const asked = askedFields(eventFields, rules, adultAt(p.dateOfBirth, p.event.startDate));
  const shown = p.event.detailsAfterAcceptance ? (p.registrationStatus === "accepted" ? askedLater(asked, true) : []) : asked;
  return { asked, shown };
}

/** The page: the participant's name and its registration card exactly as the portal builds it. */
export async function participantPageData(p: LinkParticipant) {
  const { asked, shown } = await askedFor(p);
  const own = (p.customFieldValues as Record<string, string> | null) ?? {};
  const missing = shown.filter((f) => !own[f.key]?.trim()).length;
  const card = await registrationCard(p, adultAt(p.dateOfBirth, p.event.startDate), new Map(), { requiredEmpty: askedMissing(asked, null, own), pendingChange: false }, []);
  return {
    name: p.name,
    registration: { ...card, details: shown.length ? { fields: shown.map((f) => ({ ...f, value: own[f.key] ?? "" })), missing } : null },
  };
}

/** "Doplňte údaje": every shown field, all onto the participant (there is no profile). */
export async function saveParticipantPage(p: LinkParticipant, answers: unknown): Promise<{ ok: true } | { error: "invalid"; fields: string[] }> {
  const { shown } = await askedFor(p);
  const checked = checkAnswers(shown, answers, { prefill: {}, reviewed: true });
  if (!checked.ok) return { error: "invalid", fields: checked.errors };
  await prisma.participant.update({ where: { id: p.id }, data: { customFieldValues: { ...((p.customFieldValues as Record<string, string> | null) ?? {}), ...checked.values } } });
  return { ok: true };
}
