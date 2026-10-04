import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { portalChild } from "@/lib/portal-server";
import { GATE_COOKIE_MAX_AGE, gateCookieName, gateCookieValue, portalSecret } from "@/lib/portal-gate";
import { afterGateFailure, birthDateMatches, gateThrottle } from "@/lib/portal-rules";

// Birth-date gate, once per device: { birthDate: "YYYY-MM-DD" }. Right = an
// httpOnly cookie (1 year) with the HMAC of child id + current token. Wrong
// attempts are throttled per child in the DB (10 per hour).
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { child, error } = await portalChild(token, false);
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const now = new Date();
  const throttle = gateThrottle({ failures: child.portalGateFailures, windowStart: child.portalGateWindowStart }, now);
  if (throttle.blocked) return NextResponse.json({ error: "throttled" }, { status: 429 });

  if (!birthDateMatches(body.birthDate, child.dateOfBirth)) {
    const next = afterGateFailure(throttle, now);
    await prisma.child.update({ where: { id: child.id }, data: { portalGateFailures: next.failures, portalGateWindowStart: next.windowStart } });
    return NextResponse.json({ error: "wrong" }, { status: 403 });
  }

  if (child.portalGateFailures > 0) await prisma.child.update({ where: { id: child.id }, data: { portalGateFailures: 0, portalGateWindowStart: null } });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(gateCookieName(child.id), gateCookieValue(child.id, token, portalSecret()!), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: GATE_COOKIE_MAX_AGE,
    path: "/",
  });
  return res;
}
