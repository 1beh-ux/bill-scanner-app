// The Fields Manager resolver (phase 1, docs/fields-manager-design/design.md §4): which keys exist for an event
// and what each one prints. Used ONLY when the organization flag "fields_manager" is on; with it off every caller
// keeps today's code path.
//
// Phase-1 contract (golden documents): the resolver only ADDS keys to the variables today's resolveVariables()
// builds -- aliases, guardian slot keys (guardianN_prop), linked and free event variables. A key that exists today
// always keeps today's value, so every existing template prints byte-for-byte the same.
import { prisma } from "@/lib/prisma";
import { featureOn, guardianSlots as clampSlots } from "@/lib/org-features";
import { inputOptions, readGuardianSettings } from "@/lib/guardian-fields";
import { choiceText } from "@/lib/participant-fields";
import { BUILTIN_EVENT_KEYS, EVENT_VARIABLE_ALIASES, linkedVariableValues, LINKED_VARIABLES } from "@/lib/event-variables";

// ---- guardian slots (pure) ------------------------------------------------------------------------------------

export const GUARDIAN_PROPS = ["name", "relation", "phone", "email", "mail"] as const;
export type GuardianProp = (typeof GUARDIAN_PROPS)[number];
export type GuardianIn = { name: string | null; email: string; relationship: string | null; phone: string | null; receivesCommunications: boolean; position?: number | null; extra?: unknown };

/**
 * guardian<N>_<prop> -> { slot, prop }, else null. Slots 1..maxSlots only. `ownKeys`: the organization's own guardian
 * fields (src/lib/guardian-fields.ts), also props.
 */
export function parseGuardianKey(key: string, maxSlots: number, ownKeys: readonly string[] = []): { slot: number; prop: string } | null {
  const m = key.match(/^guardian([1-9])_([a-z][a-z0-9_]*)$/);
  if (!m) return null;
  const slot = Number(m[1]);
  const prop = m[2];
  return slot <= maxSlots && ((GUARDIAN_PROPS as readonly string[]).includes(prop) || ownKeys.includes(prop)) ? { slot, prop } : null;
}

/** Guardians in slot order: explicit position first (ascending), then the rest in their stored order. */
export function orderGuardians<T extends { position?: number | null }>(guardians: T[]): T[] {
  return guardians
    .map((g, i) => ({ g, i }))
    .sort((a, b) => (a.g.position ?? Number.MAX_SAFE_INTEGER) - (b.g.position ?? Number.MAX_SAFE_INTEGER) || a.i - b.i)
    .map((x) => x.g);
}

/** Every guardian<N>_<prop> value for N = 1..slots ("" when the slot is empty). mail = Ano / Ne. */
export function guardianSlotValues(guardians: GuardianIn[], slots: number, ownKeys: readonly string[] = [], ownOptions: Record<string, unknown> = {}): Record<string, string> {
  const ordered = orderGuardians(guardians);
  const out: Record<string, string> = {};
  for (let n = 1; n <= slots; n++) {
    const g = ordered[n - 1];
    out[`guardian${n}_name`] = g?.name ?? "";
    out[`guardian${n}_relation`] = g?.relationship ?? "";
    out[`guardian${n}_phone`] = g?.phone ?? "";
    out[`guardian${n}_email`] = g?.email ?? "";
    out[`guardian${n}_mail`] = g ? (g.receivesCommunications ? "Ano" : "Ne") : "";
    const extra = (g?.extra && typeof g.extra === "object" ? g.extra : {}) as Record<string, unknown>;
    // Ano/Ne and consent values print as Ano / Ne, like the participant's own fields in documents.
    for (const k of ownKeys) out[`guardian${n}_${k}`] = typeof extra[k] === "string" ? (extra[k] === "true" || extra[k] === "false" ? choiceText(extra[k] as "true" | "false", ownOptions[k]) : (extra[k] as string).split("\n").join(", ")) : "";
  }
  return out;
}

// ---- the registry (pure) --------------------------------------------------------------------------------------

export type ResolverContext = {
  flagOn: boolean;
  slots: number;
  /** alias -> canonical key: FieldAlias rows (field, guardian, event_variable) + the built-in event aliases. */
  aliases: Record<string, string>;
  /** Free event variables of this event (organization-level ones overridden by the event's own). */
  free: Record<string, string>;
  /** Linked event variables (date_from, place, ...) for this event. */
  linked: Record<string, string>;
  /** The organization's own guardian field keys (guardian<N>_<key>, src/lib/guardian-fields.ts) + Ano/Ne settings. */
  guardianKeys?: string[];
  guardianOptions?: Record<string, unknown>;
};

/**
 * Today's variables + everything the Fields Manager adds. Existing keys are never overwritten, and neither is any
 * key that is one of the event's own fields (active or not, on this surface or not) -- today such a key prints its
 * field's value or nothing, and must keep doing so. Aliases are filled last, from their canonical key (one hop).
 */
export function extendVariables(text: Record<string, string>, ctx: ResolverContext, guardians: GuardianIn[], ownFieldKeys: Set<string>): Record<string, string> {
  const out = { ...text };
  const add = (k: string, v: string) => {
    if (!(k in out) && !ownFieldKeys.has(k)) out[k] = v;
  };
  for (const [k, v] of Object.entries(ctx.linked)) add(k, v);
  for (const [k, v] of Object.entries(ctx.free)) add(k, v);
  for (const [k, v] of Object.entries(guardianSlotValues(guardians, ctx.slots, ctx.guardianKeys, ctx.guardianOptions))) add(k, v);
  for (const [alias, target] of Object.entries(ctx.aliases)) if (target in out) add(alias, out[target]);
  return out;
}

export type KeyStatus =
  | { kind: "event_variable"; canonical: string; viaAlias: boolean }
  | { kind: "guardian"; canonical: string; slot: number; prop: string; viaAlias: boolean }
  | { kind: "field"; canonical: string; viaAlias: boolean }
  | { kind: "unresolved" };

/**
 * What a key is (no value) -- for the template check and, later, the field card. Order: event variable, guardian
 * slot key, field, alias (one hop, then the same three), unresolved.
 */
export function classifyKey(key: string, ctx: ResolverContext, fieldKeys: Set<string>): KeyStatus {
  const direct = (k: string, viaAlias: boolean): KeyStatus | null => {
    if (BUILTIN_EVENT_KEYS.has(k) || k in ctx.free) return { kind: "event_variable", canonical: k, viaAlias };
    const g = parseGuardianKey(k, ctx.slots, ctx.guardianKeys);
    if (g) return { kind: "guardian", canonical: k, ...g, viaAlias };
    if (fieldKeys.has(k)) return { kind: "field", canonical: k, viaAlias };
    return null;
  };
  return direct(key, false) ?? (ctx.aliases[key] ? direct(ctx.aliases[key], true) : null) ?? { kind: "unresolved" };
}

// ---- loading (server) -----------------------------------------------------------------------------------------

const OFF: ResolverContext = { flagOn: false, slots: 2, aliases: {}, free: {}, linked: {} };

// Bulk sends resolve one participant after another: the context is cached per event for a few seconds.
const CACHE_MS = 15_000;
const cache = new Map<string, { at: number; ctx: Promise<ResolverContext> }>();

/** Forget cached contexts (after a manager change; tests). */
export function invalidateResolverContext(eventId?: string): void {
  if (eventId) cache.delete(eventId);
  else cache.clear();
}

/** Everything the resolver needs for one event, or { flagOn: false } -- cached per event for 15 s. */
export function loadResolverContext(eventId: string): Promise<ResolverContext> {
  const hit = cache.get(eventId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ctx;
  const ctx = readResolverContext(eventId).catch((err) => {
    cache.delete(eventId);
    throw err;
  });
  cache.set(eventId, { at: Date.now(), ctx });
  return ctx;
}

async function readResolverContext(eventId: string): Promise<ResolverContext> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      organizationId: true,
      startDate: true,
      endDate: true,
      location: true,
      memberPriceCzk: true,
      nonMemberPriceCzk: true,
      registrationBankAccountNumber: true,
      registrationBankCode: true,
      publicContactEmail: true,
      bankAccount: { select: { accountNumber: true, bankCode: true } },
      organization: { select: { features: true, guardianSlots: true, contactEmail: true, guardianProps: true } },
    },
  });
  if (!event || !featureOn(event.organization.features, "fields_manager")) return OFF;
  const [aliasRows, vars] = await Promise.all([
    prisma.fieldAlias.findMany({ where: { organizationId: event.organizationId }, select: { alias: true, targetKey: true } }),
    prisma.eventVariable.findMany({ where: { organizationId: event.organizationId, OR: [{ eventId }, { eventId: null }] }, select: { key: true, value: true, eventId: true } }),
  ]);
  const free: Record<string, string> = {};
  // Organization-level values first, the event's own override them; built-in keys can't be shadowed.
  for (const v of [...vars.filter((x) => x.eventId === null), ...vars.filter((x) => x.eventId !== null)]) {
    if (!BUILTIN_EVENT_KEYS.has(v.key)) free[v.key] = v.value;
  }
  return {
    flagOn: true,
    slots: clampSlots(event.organization.guardianSlots),
    aliases: { ...EVENT_VARIABLE_ALIASES, ...Object.fromEntries(aliasRows.map((a) => [a.alias, a.targetKey])) },
    free,
    linked: linkedVariableValues({ ...event, organizationContactEmail: event.organization.contactEmail }),
    guardianKeys: readGuardianSettings(event.organization.guardianProps).fields.map((f) => f.key),
    guardianOptions: Object.fromEntries(readGuardianSettings(event.organization.guardianProps).fields.map((f) => [f.key, inputOptions(f)])),
  };
}

/** All event-variable keys the resolver knows for an event (built-in, linked, free) -- for the manager's lists. */
export function knownEventKeys(ctx: ResolverContext): string[] {
  return [...BUILTIN_EVENT_KEYS, ...LINKED_VARIABLES.map((v) => v.key), ...Object.keys(ctx.free)].filter((k, i, a) => a.indexOf(k) === i);
}
