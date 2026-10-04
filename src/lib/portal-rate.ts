// Rate limits of the public pages (public form submits, portal re-sends and
// uploads), counted in the DB so every Cloud Run instance sees the same
// numbers. Keys hold no secrets: IPs are HMAC-hashed, never stored or logged.
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { portalSecret } from "@/lib/portal-gate";

/**
 * Records one attempt under `key` and says whether it is still within
 * `limit` attempts per `windowMs` (this one included). Rows older than two
 * days are pruned on the way.
 */
export async function takeRateSlot(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const used = await prisma.portalRateHit.count({ where: { key, createdAt: { gte: new Date(now - windowMs) } } });
  if (used >= limit) return false;
  await prisma.$transaction([
    prisma.portalRateHit.create({ data: { key } }),
    prisma.portalRateHit.deleteMany({ where: { createdAt: { lt: new Date(now - 2 * 24 * 3600 * 1000) } } }),
  ]);
  return true;
}

/** The caller's IP (first X-Forwarded-For hop behind Cloud Run), hashed. */
export function hashedIp(req: Request): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return crypto.createHmac("sha256", portalSecret() ?? "portal-rate").update(ip).digest("base64url").slice(0, 32);
}
