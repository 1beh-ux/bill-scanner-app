import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { readMedsPageSettings } from "@/lib/meds-page-settings";

// Léky a výdej settings (src/lib/meds-page-settings.ts): GET = the event's (with defaults), PUT = save (Zdraví access).
async function guard(eventId: string) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return requireModuleAccess(user, eventId, "health");
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guard(id);
  if (denied) return denied;
  const e = await prisma.event.findUniqueOrThrow({ where: { id }, select: { medsPageSettings: true } });
  return NextResponse.json(readMedsPageSettings(e.medsPageSettings));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guard(id);
  if (denied) return denied;
  const settings = readMedsPageSettings(await req.json().catch(() => ({})));
  await prisma.event.update({ where: { id }, data: { medsPageSettings: settings } });
  return NextResponse.json(settings);
}
