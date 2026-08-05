import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { initAdmin } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

initAdmin();

export async function POST(req: NextRequest) {
  const { idToken } = await req.json();
  const decoded = await getAuth().verifyIdToken(idToken);
  const email = decoded.email;

  if (!email) {
    return NextResponse.json({ error: "No email" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    return NextResponse.json({ error: "Not allowlisted" }, { status: 403 });
  }

  const sessionCookie = await getAuth().createSessionCookie(idToken, {
    expiresIn: 60 * 60 * 24 * 5 * 1000,
  });

  const response = NextResponse.json({ ok: true, role: user.role });
  response.cookies.set("session", sessionCookie, {
    httpOnly: true,
    secure: true,
    maxAge: 60 * 60 * 24 * 5,
    path: "/",
  });
  return response;
}
