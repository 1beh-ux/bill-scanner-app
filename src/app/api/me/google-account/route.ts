import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { invalidateDriveIdentity } from "@/lib/drive";

// The caller's own connected Google account (Drive/Sheets/Docs) and the events
// whose Drive work currently runs as it.
async function overview(userId: string) {
  const [account, events] = await Promise.all([
    prisma.driveAccount.findUnique({ where: { connectedByUserId: userId }, select: { email: true, connectedAt: true, tokenInvalidAt: true } }),
    prisma.event.findMany({ where: { driveConfiguredByUserId: userId }, select: { id: true, name: true, status: true }, orderBy: { startDate: "desc" } }),
  ]);
  return {
    connected: !!account,
    email: account?.email ?? null,
    connectedAt: account?.connectedAt ?? null,
    // false = Google rejected the stored token (revoked/expired): reconnect
    valid: !!account && !account.tokenInvalidAt,
    events,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json(await overview(user.id));
}

// Disconnect. Events configured by this user keep pointing at them and fall
// back to the service account (with a warning) until someone takes over.
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const before = await overview(user.id);
  await prisma.driveAccount.deleteMany({ where: { connectedByUserId: user.id } });
  invalidateDriveIdentity();
  return NextResponse.json({ ok: true, affectedEvents: before.events });
}
