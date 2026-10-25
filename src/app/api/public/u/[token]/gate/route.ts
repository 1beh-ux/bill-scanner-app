import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { birthDatePasses, GATE_FAILURES_PER_HOUR, participantGateSubject, participantScope } from "@/lib/participant-link";
import { GATE_COOKIE_MAX_AGE, gateCookieName, gateCookieValue, portalSecret } from "@/lib/portal-gate";

// Birth-date gate of a participant's page, like the portal's: { birthDate } -> a signed httpOnly cookie
// (+ the value in the body for an embedded page). 10 wrong ones an hour block even a right one.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { p, error } = await participantScope(token, false);
  if (error) return error;
  const key = `ugate:${p.id}`;
  const failures = await prisma.portalRateHit.count({ where: { key, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (failures >= GATE_FAILURES_PER_HOUR) return NextResponse.json({ error: "throttled" }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  if (!birthDatePasses(p, body.birthDate)) {
    await prisma.portalRateHit.create({ data: { key } });
    return NextResponse.json({ error: "wrong" }, { status: 403 });
  }
  const subject = participantGateSubject(p.id);
  const gate = gateCookieValue(subject, token, portalSecret()!);
  const res = NextResponse.json({ ok: true, gate });
  res.cookies.set(gateCookieName(subject), gate, { httpOnly: true, secure: true, sameSite: "lax", maxAge: GATE_COOKIE_MAX_AGE, path: "/" });
  return res;
}
