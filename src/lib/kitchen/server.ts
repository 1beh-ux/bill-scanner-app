// Kuchyně, server side (docs/kitchen-planning-design.md): the guards, the org's default lists and the
// data headcount needs. No roles inside the module: the kitchen grant (org admins pass) sees and edits all.
import { NextResponse } from "next/server";
import type { ListTemplateKind } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId, isOrgAdmin } from "@/lib/org-scope";
import { adultsGuard } from "@/lib/adults-server";
import { ALLERGEN_CODES, CONTENT_FLAGS, DEFAULT_DIETS, cleanCodes, mapAllergyText, type DietDef, type PersonDiet } from "./allergens";
import type { Band, HcAdjust, HcAdult, HcParticipant } from "./headcount";
import { createHash } from "node:crypto";

/** Event kitchen routes: the Kuchyně grant on the event (404 outside the acting organization). */
export const kitchenGuard = adultsGuard;

/** Library routes (org-owned meals, ingredients): an org admin, or a Kuchyně grant on any event of the acting org. */
export async function libraryGuard(): Promise<{ error: NextResponse } | { user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; organizationId: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const organizationId = await getActingOrgId(user);
  if (!(await hasKitchenAccessInOrg(user, organizationId))) return { error: NextResponse.json({ error: "module_access_denied" }, { status: 403 }) };
  return { user, organizationId };
}

export async function hasKitchenAccessInOrg(user: { id: string; role: string; isSuperAdmin: boolean }, organizationId: string) {
  if (isOrgAdmin(user as never)) return true;
  return !!(await prisma.userEventModuleAccess.findFirst({ where: { userId: user.id, moduleKey: "kitchen", event: { organizationId } }, select: { userId: true } }));
}

export const DEFAULT_SLOTS = [
  { name: "Snídaně", time: "08:00" },
  { name: "Dopolední svačina", time: "10:30" },
  { name: "Oběd", time: "12:30" },
  { name: "Odpolední svačina", time: "15:30" },
  { name: "Večeře", time: "18:30" },
  { name: "Druhá večeře", time: "21:00" },
];
export const DEFAULT_BANDS: (Band & { name: string })[] = [
  { name: "0–5 let", ageFrom: 0, ageTo: 5, factor: 0.5 },
  { name: "6–9 let", ageFrom: 6, ageTo: 9, factor: 0.7 },
  { name: "10–14 let", ageFrom: 10, ageTo: 14, factor: 0.9 },
  { name: "15–17 let", ageFrom: 15, ageTo: 17, factor: 1.0 },
  { name: "18+ let", ageFrom: 18, ageTo: null, factor: 1.1 },
];

/** First use: the org gets the default slots and bands (if it has none), the event a copy of the org's. */
export async function ensureKitchenLists(eventId: string, organizationId: string) {
  const defaults: [ListTemplateKind, { name: string; data: object }[]][] = [
    ["kitchen_slot", DEFAULT_SLOTS.map((s) => ({ name: s.name, data: { time: s.time } }))],
    ["kitchen_band", DEFAULT_BANDS.map(({ name, ...b }) => ({ name, data: b }))],
  ];
  for (const [kind, rows] of defaults) {
    if (await prisma.eventListItem.count({ where: { eventId, kind } })) continue;
    let templates = await prisma.listTemplate.findMany({ where: { organizationId, kind, active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    if (!templates.length && !(await prisma.listTemplate.count({ where: { organizationId, kind } }))) {
      await prisma.listTemplate.createMany({ data: rows.map((r, i) => ({ organizationId, kind, name: r.name, sortOrder: i, data: r.data })) });
      templates = await prisma.listTemplate.findMany({ where: { organizationId, kind }, orderBy: { sortOrder: "asc" } });
    }
    await prisma.eventListItem.createMany({ data: templates.map((t, i) => ({ eventId, kind, key: t.key, name: t.name, sortOrder: t.sortOrder ?? i, data: t.data ?? undefined, isFromTemplate: true })) });
  }
}

/** The organization's diets (Šablony -> Kuchyně); the defaults are created on first use. */
export async function orgDiets(organizationId: string): Promise<DietDef[]> {
  let rows = await prisma.listTemplate.findMany({ where: { organizationId, kind: "kitchen_diet" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  if (!rows.length) {
    await prisma.listTemplate.createMany({ data: DEFAULT_DIETS.map((d, i) => ({ organizationId, kind: "kitchen_diet" as const, key: d.code, name: d.name, sortOrder: i, data: { keywords: d.keywords, contents: d.contents, allergens: d.allergens } })) });
    rows = await prisma.listTemplate.findMany({ where: { organizationId, kind: "kitchen_diet" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  }
  return rows
    .filter((r) => r.active && r.key)
    .map((r) => {
      const d = (r.data ?? {}) as { keywords?: unknown; contents?: unknown; allergens?: unknown };
      return {
        code: r.key!,
        name: r.name,
        keywords: Array.isArray(d.keywords) ? d.keywords.filter((k): k is string => typeof k === "string" && !!k.trim()) : [],
        contents: cleanCodes(d.contents, [...CONTENT_FLAGS]),
        allergens: cleanCodes(d.allergens, ALLERGEN_CODES),
      };
    });
}
export const dietCodesOf = async (organizationId: string) => (await orgDiets(organizationId)).map((d) => d.code);

export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const dayDate = (s: string) => new Date(`${s}T00:00:00Z`);
export const isIsoDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
export function eventDays(start: Date, end: Date) {
  const out: string[] = [];
  for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())); d <= end && out.length < 60; d.setUTCDate(d.getUTCDate() + 1)) out.push(iso(d));
  return out;
}
export const hashText = (s: string) => createHash("sha256").update(s.trim()).digest("hex").slice(0, 32);

/** The participants' allergy field: the setting, else a field keyed / labelled "alergie". */
export async function allergyFieldKey(eventId: string, setting: string | null | undefined) {
  if (setting) return setting;
  const fields = await prisma.eventParticipantField.findMany({ where: { eventId, active: true }, select: { key: true, label: true } });
  return (fields.find((f) => f.key === "alergie" || f.key === "allergies") ?? fields.find((f) => /alergi/i.test(f.label)))?.key ?? null;
}

/**
 * D1 (audit2): one participant's diet as Kuchyně sees it -- confirmed (and still matching the parents' text),
 * unverified (text nobody confirmed, or changed since), or none. Null when the event has no allergy field.
 */
export async function participantDietState(p: { eventId: string; customFieldValues: unknown; diet: { allergens: string[]; dietFlags: string[]; rawTextHash: string } | null }) {
  const settings = await prisma.eventKitchenSettings.findUnique({ where: { eventId: p.eventId }, select: { allergyFieldKey: true } });
  const key = await allergyFieldKey(p.eventId, settings?.allergyFieldKey);
  if (!key) return null;
  const raw = String(((p.customFieldValues as Record<string, unknown> | null) ?? {})[key] ?? "").trim();
  if (p.diet && p.diet.rawTextHash === hashText(raw)) return { status: "confirmed" as const, allergens: p.diet.allergens, dietFlags: p.diet.dietFlags };
  return { status: raw || p.diet ? ("unverified" as const) : ("none" as const), allergens: [], dietFlags: [] };
}

/** Everything the plan, cook sheet and shopping list compute from (one event). */
export async function kitchenContext(event: { id: string; organizationId: string; startDate: Date; endDate: Date }) {
  await ensureKitchenLists(event.id, event.organizationId);
  const [settings, items, participants, adults, adjusts, absences] = await Promise.all([
    prisma.eventKitchenSettings.findUnique({ where: { eventId: event.id } }),
    prisma.eventListItem.findMany({ where: { eventId: event.id, kind: { in: ["kitchen_slot", "kitchen_band"] } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.participant.findMany({ where: { eventId: event.id }, select: { id: true, name: true, dateOfBirth: true, active: true, registrationStatus: true, customFieldValues: true, child: { select: { dateOfBirth: true } }, diet: true } }),
    prisma.eventPerson.findMany({ where: { eventId: event.id }, select: { id: true, eats: true, days: true, child: { select: { name: true, dateOfBirth: true, allergens: true, dietFlags: true, dietNote: true } } } }),
    prisma.headcountAdjust.findMany({ where: { eventId: event.id }, orderBy: { dateFrom: "asc" } }),
    prisma.mealAbsence.findMany({ where: { eventId: event.id } }),
  ]);
  const fieldKey = await allergyFieldKey(event.id, settings?.allergyFieldKey);
  const dietDefs = await orgDiets(event.organizationId);
  const slots = items.filter((i) => i.kind === "kitchen_slot" && i.active).map((i) => ({ id: i.id, name: i.name, time: ((i.data as { time?: string } | null)?.time ?? null) as string | null }));
  const bands: Band[] = items
    .filter((i) => i.kind === "kitchen_band" && i.active)
    .map((i) => i.data as { ageFrom?: number; ageTo?: number | null; factor?: number } | null)
    .filter((d): d is Band => !!d && typeof d.ageFrom === "number" && typeof d.factor === "number")
    .map((d) => ({ ageFrom: d.ageFrom, ageTo: d.ageTo ?? null, factor: d.factor }));
  const abs = (pred: (a: (typeof absences)[number]) => boolean) => absences.filter(pred).map((a) => ({ date: iso(a.date), slotId: a.slotItemId }));
  const hcParticipants: HcParticipant[] = participants.map((p) => {
    const dob = p.dateOfBirth ?? p.child?.dateOfBirth ?? null;
    return { id: p.id, name: p.name, dateOfBirth: dob ? iso(dob) : null, active: p.active, accepted: p.registrationStatus === "accepted", absences: abs((a) => a.participantId === p.id) };
  });
  const hcAdults: HcAdult[] = adults.map((a) => ({ id: a.id, name: a.child.name, dateOfBirth: a.child.dateOfBirth ? iso(a.child.dateOfBirth) : null, eats: a.eats, days: a.days, absences: abs((x) => x.eventPersonId === a.id) }));
  const hcAdjusts: HcAdjust[] = adjusts.map((x) => ({ from: iso(x.dateFrom), to: iso(x.dateTo), slotId: x.slotItemId, count: x.count, factor: Number(x.factor), label: x.label }));
  // Diets: a participant's confirmed review, or "neověřeno" when the allergy text says something unconfirmed
  // (or changed after the confirmation); adults' own (Lidé) data counts as confirmed.
  const diets: (PersonDiet & { rawText: string; changed: boolean; proposal: ReturnType<typeof mapAllergyText> })[] = participants
    .filter((p) => p.active)
    .map((p) => {
      const raw = fieldKey ? String(((p.customFieldValues as Record<string, unknown> | null) ?? {})[fieldKey] ?? "").trim() : "";
      const proposal = mapAllergyText(raw, dietDefs);
      const changed = !!p.diet && p.diet.rawTextHash !== hashText(raw);
      const status: PersonDiet["status"] = p.diet && !changed ? "confirmed" : raw && (proposal.allergens.length || proposal.dietFlags.length || proposal.unmapped.length) ? "unverified" : p.diet ? "unverified" : "none";
      const src = p.diet && !changed ? p.diet : proposal;
      return { key: `p:${p.id}`, name: p.name, allergens: src.allergens, dietFlags: src.dietFlags, status, rawText: raw, unmapped: proposal.unmapped, changed, proposal };
    });
  const adultDiets: PersonDiet[] = adults.filter((a) => a.eats).map((a) => ({ key: `a:${a.id}`, name: a.child.name, allergens: a.child.allergens, dietFlags: a.child.dietFlags, status: a.child.allergens.length || a.child.dietFlags.length ? "confirmed" : "none", rawText: a.child.dietNote ?? undefined }));
  return {
    dietDefs,
    settings: settings ?? { eventId: event.id, allergyFieldKey: null, foodCategoryIds: [] as string[], countOnlyAccepted: false, feedbackUnlockMinutes: 30 },
    allergyFieldKey: fieldKey,
    slots,
    bands,
    days: eventDays(event.startDate, event.endDate),
    hc: { eventStart: iso(event.startDate), eventEnd: iso(event.endDate), bands, countOnlyAccepted: settings?.countOnlyAccepted ?? false, participants: hcParticipants, adults: hcAdults, adjusts: hcAdjusts },
    adjusts,
    diets,
    adultDiets,
    adultNotes: adults.filter((a) => a.child.dietNote).map((a) => ({ name: a.child.name, note: a.child.dietNote! })),
  };
}
export type KitchenContext = Awaited<ReturnType<typeof kitchenContext>>;
