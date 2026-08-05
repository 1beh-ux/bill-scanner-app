import { cookies } from "next/headers";
import { getAuth } from "firebase-admin/auth";
import { initAdmin } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

initAdmin();

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;
  if (!session) return null;

  try {
    const decoded = await getAuth().verifySessionCookie(session, true);
    if (!decoded.email) return null;

    const user = await prisma.user.findUnique({ where: { email: decoded.email } });
    if (!user || !user.active) return null;

    return user;
  } catch {
    return null;
  }
}
