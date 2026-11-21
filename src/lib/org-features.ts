// Per-organization feature flags (Organization.features). Fields Manager: "fields_manager" -- off for every
// organization until it is switched on explicitly (docs/fields-manager-design/plan.md). Pure helpers first, so the
// self-check (org-features.check.ts) needs no database.
import { prisma } from "@/lib/prisma";

export const FEATURES = ["fields_manager"] as const;
export type Feature = (typeof FEATURES)[number];

export const isFeature = (v: unknown): v is Feature => typeof v === "string" && (FEATURES as readonly string[]).includes(v);

/** Is the flag in this stored list? Unknown entries are ignored. */
export function featureOn(features: readonly string[] | null | undefined, feature: Feature): boolean {
  return !!features?.includes(feature);
}

/** The stored list with the flag switched on/off (unknown entries dropped, no duplicates, stable order). */
export function withFeature(features: readonly string[] | null | undefined, feature: Feature, on: boolean): Feature[] {
  const kept = new Set((features ?? []).filter(isFeature));
  if (on) kept.add(feature);
  else kept.delete(feature);
  return FEATURES.filter((f) => kept.has(f));
}

/** Guardian slots offered by imports and documents (Organization.guardianSlots), clamped to 1..6. */
export const MAX_GUARDIAN_SLOTS = 6;
export function guardianSlots(stored: number | null | undefined): number {
  if (stored == null) return 2;
  const n = Math.trunc(Number(stored));
  return Number.isFinite(n) ? Math.min(MAX_GUARDIAN_SLOTS, Math.max(1, n)) : 2;
}

/** Does this organization have the flag on? */
export async function hasFeature(organizationId: string, feature: Feature): Promise<boolean> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { features: true } });
  return featureOn(org?.features, feature);
}

/** Does the event's organization have the flag on? */
export async function eventHasFeature(eventId: string, feature: Feature): Promise<boolean> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { organization: { select: { features: true } } } });
  return featureOn(event?.organization.features, feature);
}
