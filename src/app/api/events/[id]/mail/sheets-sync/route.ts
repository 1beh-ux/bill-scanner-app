import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { syncStatusSheetExport } from "@/lib/mail-sheets-sync";

export async function POST(
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

  // Switched off (2026-11-27) = never written or created, also by this button.
  const ev = await prisma.event.findUnique({ where: { id: eventId }, select: { statusExportEnabled: true } });
  if (!ev?.statusExportEnabled) return NextResponse.json({ error: "status_export_off" }, { status: 409 });
  const result = await syncStatusSheetExport(eventId);
  if (!result) {
    return NextResponse.json({ error: "export_folder_not_configured" }, { status: 409 });
  }
  return NextResponse.json(result);
}
