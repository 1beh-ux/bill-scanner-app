import { prisma } from "@/lib/prisma";

function normalizeMerchantText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Looks up a canonical merchant name for AI-extracted raw text, if a
 * correction has been recorded before. Returns null when there's no known
 * mapping — the caller should just use the raw text as-is in that case.
 */
export async function resolveCanonicalMerchant(rawMerchantName: string | null): Promise<string | null> {
  if (!rawMerchantName) return null;
  const key = normalizeMerchantText(rawMerchantName);
  if (!key) return null;
  const alias = await prisma.merchantAlias.findUnique({ where: { rawText: key } });
  return alias?.canonicalName ?? null;
}

/**
 * Records or updates a raw-text -> canonical-name mapping, learned from a
 * human correcting an AI-extracted merchant name. Safe to call on every
 * merchant name edit — always reflects the person's latest correction, not
 * just whichever one happened first.
 */
export async function recordMerchantCorrection(
  rawMerchantName: string,
  correctedName: string,
  /** The bill's event's organization: the alias is learned for it. */
  organizationId: string | null
): Promise<void> {
  const key = normalizeMerchantText(rawMerchantName);
  const canonical = correctedName.trim();
  if (!key || !canonical) return;
  // Not a real correction if it normalizes to the same thing (e.g. just a
  // casing change) — nothing useful to learn from that.
  if (normalizeMerchantText(canonical) === key) return;

  // Find + update/create, not upsert (ON CONFLICT on a unique organizations_required replaces).
  const existing = await prisma.merchantAlias.findFirst({ where: { rawText: key } });
  if (existing) await prisma.merchantAlias.update({ where: { id: existing.id }, data: { canonicalName: canonical } });
  else await prisma.merchantAlias.create({ data: { rawText: key, canonicalName: canonical, organizationId } });
}