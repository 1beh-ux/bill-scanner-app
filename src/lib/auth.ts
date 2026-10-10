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

    const user = await prisma.user.findUnique({ where: { email: decoded.email }, include: { organization: { select: { active: true } } } });
    // A deactivated organization's users are treated like inactive users.
    if (!user || !user.active || !user.organization.active) return null;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { organization, ...plain } = user;
    return plain;
  } catch {
    return null;
  }
}
