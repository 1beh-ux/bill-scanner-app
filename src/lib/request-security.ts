// Request-level security helpers (audit 2026-11-05): constant-time secret comparison for the cron / task
// endpoints, and the real client IP behind Google's front end for rate limits.
import crypto from "crypto";

/**
 * Does the provided header equal the expected secret? Constant time: both are hashed to 32 bytes first, so
 * timingSafeEqual always compares equal-length buffers and the length of the secret leaks nothing either.
 * No expected secret configured = never.
 */
export function secretMatches(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!expected || typeof provided !== "string") return false;
  const h = (s: string) => crypto.createHash("sha256").update(s).digest();
  return crypto.timingSafeEqual(h(provided), h(expected));
}

/** Cron endpoints (Cloud Scheduler): the x-cron-secret header against CRON_SECRET. */
export const cronAuthorized = (req: Request) => secretMatches(req.headers.get("x-cron-secret"), process.env.CRON_SECRET);

/**
 * The client's IP as Google saw it. X-Forwarded-For is "<whatever the client sent>, <hops Google appended>":
 * the first entries are caller-controlled, only the ones Google appends can be trusted.
 * - Custom domains (tabornik.online, public hosts) go through the global external Application Load Balancer,
 *   which appends "<client-ip>,<load-balancer-ip>" (docs/custom-domain.md: LB -> serverless NEG -> Cloud Run):
 *   the client is the second entry from the end.
 * - *.run.app is Cloud Run's own front end (Cloud Tasks / Scheduler, direct access; ingress is "all"), which
 *   appends just the client: the last entry. Google routes run.app by its Host, so a request can't claim it.
 * Fewer entries than expected (local dev, tests): the first one there is.
 */
export function clientIp(headers: Headers): string {
  const hops = (headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const host = (headers.get("host") ?? "").toLowerCase().split(":")[0];
  const fromEnd = host.endsWith(".run.app") ? 1 : 2;
  return hops[hops.length - fromEnd] ?? hops[0] ?? headers.get("x-real-ip") ?? "unknown";
}
