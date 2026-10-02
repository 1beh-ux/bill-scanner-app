import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";

// The Zdraví list's optional columns ("Sloupce"), per event.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "health");
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const keys = Array.isArray(body.keys) ? body.keys.filter((k: unknown): k is string => typeof k === "string").slice(0, 100) : [];
  await prisma.event.update({ where: { id: eventId }, data: { healthListColumns: keys } });
  return NextResponse.json({ keys });
}
