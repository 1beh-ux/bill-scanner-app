import { NextRequest, NextResponse } from "next/server";
import { portalScope, saveGateThrottle } from "@/lib/portal-server";
import { GATE_COOKIE_MAX_AGE, gateCookieName, gateCookieValue, portalSecret } from "@/lib/portal-gate";
import { afterGateFailure, gatePasses, gateThrottle } from "@/lib/portal-rules";

// Birth-date gate, once per device: { birthDate: "YYYY-MM-DD" }. Right = an
// httpOnly cookie (1 year) with the HMAC of the scope (child id, or the family)
// + current token. A family link takes any member's birth date. Wrong attempts
// are throttled per child / family in the DB (10 per hour).
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { scope, error } = await portalScope(token, false);
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const now = new Date();
  const throttle = gateThrottle({ failures: scope.gateFailures, windowStart: scope.gateWindowStart }, now);
  if (throttle.blocked) return NextResponse.json({ error: "throttled" }, { status: 429 });

  if (!gatePasses(body.birthDate, scope.members)) {
    const next = afterGateFailure(throttle, now);
    await saveGateThrottle(scope, next.failures, next.windowStart);
    return NextResponse.json({ error: "wrong" }, { status: 403 });
  }

  if (scope.gateFailures > 0) await saveGateThrottle(scope, 0, null);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(gateCookieName(scope.subject), gateCookieValue(scope.subject, token, portalSecret()!), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: GATE_COOKIE_MAX_AGE,
    path: "/",
  });
  return res;
}
