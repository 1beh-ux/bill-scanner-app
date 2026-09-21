import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { invalidateDriveIdentity } from "@/lib/drive";

// "Převzít správu Drive této akce": from now on the event's Drive work runs as
// the caller's connected Google account (or the service account, with a
// warning, if they haven't connected one).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;

  await prisma.event.update({ where: { id: eventId }, data: { driveConfiguredByUserId: user.id } });
  invalidateDriveIdentity(eventId);
  return NextResponse.json({ ok: true });
}
