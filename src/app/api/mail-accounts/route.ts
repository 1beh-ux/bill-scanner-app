import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Addresses only, never the encrypted refresh tokens -- any authenticated
// user can see which mailboxes are already connected, to reuse them on
// another event without re-authorizing.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const accounts = await prisma.mailSenderAccount.findMany({
    select: { email: true },
    orderBy: { email: "asc" },
  });
  return NextResponse.json(accounts.map((a) => a.email));
}
