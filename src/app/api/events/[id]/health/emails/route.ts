import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "health");
  if (denied) return denied;

  const logs = await prisma.parentEmailLog.findMany({
    where: { participant: { eventId } },
    orderBy: { sentAt: "desc" },
    include: {
      participant: { select: { name: true } },
      guardian: { select: { email: true, name: true } },
    },
  });

  return NextResponse.json(logs);
}
