import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePublicHost } from "@/lib/public-host";
import { hashedIp, takeRateSlot } from "@/lib/portal-rate";
import { recoverPortalLink } from "@/lib/portal-recovery";

// Public "Zapomněl(a) jsem odkaz do portálu" (src/lib/portal-recovery.ts). The organization: the
// portal link the parent is on (token), else the organization's public address. Always "ok" -- the
// answer never says whether the e-mail / birth date matched anyone. 5 tries per hour per IP, 3 a day per e-mail.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  if (!(await takeRateSlot(`recover-ip:${hashedIp(req)}`, 5, 3600_000)) || !(await takeRateSlot(`recover-mail:${organizationId}:${email}`, 3, 24 * 3600_000))) {
    return NextResponse.json({ error: "throttled" }, { status: 429 });
  }
  const sent = await recoverPortalLink({ organizationId, email, birthDate, req }).catch((err) => {
    console.log("[portal-recovery] failed:", err instanceof Error ? err.message.slice(0, 100) : "unknown");
    return 0;
  });
  console.log(`[portal-recovery] org=${organizationId} sent=${sent}`);
  return NextResponse.json({ ok: true });
}
