import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { initAdmin } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { hashedIp, takeRateSlot } from "@/lib/portal-rate";

initAdmin();

// Sign-in (Google ID token -> 5-day session cookie). A bad / expired token is a 401, never a 500; at most
// SESSION_LIMIT attempts per IP per 15 minutes (audit 2026-11-05).
const SESSION_LIMIT = 30;

export async function POST(req: NextRequest) {
  if (!(await takeRateSlot(`session:${hashedIp(req)}`, SESSION_LIMIT, 15 * 60 * 1000))) return NextResponse.json({ error: "throttled" }, { status: 429 });
  const body = await req.json().catch(() => null);
  const idToken = typeof body?.idToken === "string" ? body.idToken : "";
  if (!idToken) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  let email: string | undefined;
  try {
    email = (await getAuth().verifyIdToken(idToken)).email;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
  if (!email) {
    return NextResponse.json({ error: "No email" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email }, include: { organization: { select: { active: true } } } });
  // A deactivated organization's users get the same answer as inactive users.
  if (!user || !user.active || !user.organization.active) {
    return NextResponse.json({ error: "Not allowlisted" }, { status: 403 });
  }

  let sessionCookie: string;
  try {
    sessionCookie = await getAuth().createSessionCookie(idToken, { expiresIn: 60 * 60 * 24 * 5 * 1000 });
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, role: user.role });
  response.cookies.set("session", sessionCookie, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 5,
    path: "/",
  });
  return response;
}
