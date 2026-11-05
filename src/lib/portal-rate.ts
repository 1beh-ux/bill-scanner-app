// Rate limits of the public pages (public form submits, portal re-sends and
// uploads), counted in the DB so every Cloud Run instance sees the same
// numbers. Keys hold no secrets: IPs are HMAC-hashed, never stored or logged.
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { portalSecret } from "@/lib/portal-gate";
import { clientIp } from "@/lib/request-security";

/**
 * Records one attempt under `key` and says whether it is still within
 * `limit` attempts per `windowMs` (this one included). Rows older than two
 * days are pruned on the way.
 */
export async function takeRateSlot(key: string, limit: number, windowMs: number): Promise<boolean> {
  if (!(await rateSlotFree(key, limit, windowMs))) return false;
  await recordRateHit(key);
  return true;
}

/** Whether `key` still has a slot, without using one (count only what really happened, audit2 R5-1). */
export async function rateSlotFree(key: string, limit: number, windowMs: number): Promise<boolean> {
  return (await prisma.portalRateHit.count({ where: { key, createdAt: { gte: new Date(Date.now() - windowMs) } } })) < limit;
}

/** Uses one slot of `key`; rows older than two days are pruned on the way. */
export async function recordRateHit(key: string): Promise<void> {
  const now = Date.now();
  await prisma.$transaction([
    prisma.portalRateHit.create({ data: { key } }),
    prisma.portalRateHit.deleteMany({ where: { createdAt: { lt: new Date(now - 2 * 24 * 3600 * 1000) } } }),
  ]);
}

/** The caller's IP as Google's front end saw it (src/lib/request-security.ts clientIp), hashed. */
export function hashedIp(req: Request): string {
  const ip = clientIp(req.headers);
  return crypto.createHmac("sha256", portalSecret() ?? "portal-rate").update(ip).digest("base64url").slice(0, 32);
}
