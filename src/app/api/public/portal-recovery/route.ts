import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePublicHost } from "@/lib/public-host";
import { hashedIp, rateSlotFree, recordRateHit, takeRateSlot } from "@/lib/portal-rate";
import { recoverPortalLink } from "@/lib/portal-recovery";

// Public "Zapomněl(a) jsem odkaz do portálu" (src/lib/portal-recovery.ts). The organization: the
// portal link the parent is on (token), else the organization's public address. Always "ok" -- the
// answer never says whether the e-mail / birth date matched anyone. 5 tries per hour per IP; 3 sent mails a
// day per e-mail -- only mails that went out count (audit2 R5-1), so a stranger's wrong guesses can't lock a
// parent out of their own recovery.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// R5 (audit2): every answer after the attempt takes at least this long, so the response time doesn't tell a
// match (a mail was sent) from a miss. Not "send after responding": Cloud Run's request-based CPU throttles
// work after the response.
const MIN_RESPONSE_MS = 2500;

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { email?: unknown; birthDate?: unknown; token?: unknown };
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase().slice(0, 200) : "";
  const birthDate = typeof b.birthDate === "string" ? b.birthDate.trim() : "";
  if (!EMAIL.test(email) || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  let organizationId: string | null = null;
  if (typeof b.token === "string" && b.token.length <= 100 && b.token) {
    organizationId =
      (await prisma.child.findUnique({ where: { portalToken: b.token }, select: { organizationId: true } }))?.organizationId ??
      (await prisma.family.findUnique({ where: { portalToken: b.token }, select: { organizationId: true } }))?.organizationId ??
      null;
  }
  if (!organizationId) {
    const scope = await resolvePublicHost(req);
    if (scope.kind === "public") organizationId = scope.organizationId;
  }
  if (!organizationId) return NextResponse.json({ ok: true });

  const mailKey = `recover-mail:${organizationId}:${email}`;
  if (!(await takeRateSlot(`recover-ip:${hashedIp(req)}`, 5, 3600_000))) return NextResponse.json({ error: "throttled" }, { status: 429 });
  // A full e-mail quota means 3 real sends today: answer the usual "ok" (a 429 here would reveal a match).
  if (!(await rateSlotFree(mailKey, 3, 24 * 3600_000))) {
    await new Promise((ok) => setTimeout(ok, MIN_RESPONSE_MS));
    return NextResponse.json({ ok: true });
  }
  const started = Date.now();
  const sent = await recoverPortalLink({ organizationId, email, birthDate, req }).catch((err) => {
    console.log("[portal-recovery] failed:", err instanceof Error ? err.message.slice(0, 100) : "unknown");
    return 0;
  });
  if (sent > 0) await recordRateHit(mailKey);
  console.log(`[portal-recovery] org=${organizationId} sent=${sent}`);
  await new Promise((ok) => setTimeout(ok, Math.max(0, MIN_RESPONSE_MS - (Date.now() - started))));
  return NextResponse.json({ ok: true });
}
