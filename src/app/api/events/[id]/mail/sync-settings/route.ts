import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "mail");
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const driveDocSyncEnabled = typeof body.driveDocSyncEnabled === "boolean" ? body.driveDocSyncEnabled : undefined;
  const statusExportEnabled = typeof body.statusExportEnabled === "boolean" ? body.statusExportEnabled : undefined;

  const event = await prisma.event.update({
    where: { id: eventId },
    data: {
      ...(driveDocSyncEnabled !== undefined && { driveDocSyncEnabled }),
      ...(statusExportEnabled !== undefined && { statusExportEnabled }),
    },
  });

  return NextResponse.json(event);
}
