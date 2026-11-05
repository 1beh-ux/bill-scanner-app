import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { isOrgAdmin } from "@/lib/org-scope";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  // Organization admins only (audit 2026-11-05 P1): closing / reopening the event and re-pointing its Drive
  // aren't part of working with receipts.
  const denied = await requireModuleAccess(user, id, "bills");
  if (denied) return denied;
  if (!isOrgAdmin(user)) return NextResponse.json({ error: "admin_only" }, { status: 403 });

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (event.status === "active") {
    return NextResponse.json({ error: "event_already_active" }, { status: 400 });
  }

  const updated = await prisma.event.update({
    where: { id },
    data: { status: "active", closedAt: null },
  });
  return NextResponse.json(updated);
}