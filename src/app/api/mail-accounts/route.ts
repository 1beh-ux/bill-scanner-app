import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isOrgAdmin, orgWhere } from "@/lib/org-scope";

// Addresses only, never the encrypted refresh tokens. Organization admins see every connected mailbox of the
// acting organization (to reuse one on another event without re-authorizing); others only the ones they
// connected themselves (N1, audit2).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const accounts = await prisma.mailSenderAccount.findMany({
    where: { ...(await orgWhere(user)), ...(!isOrgAdmin(user) && { connectedByUserId: user.id }) },
    select: { email: true, scope: true },
    orderBy: { email: "asc" },
  });
  return NextResponse.json(accounts);
}
