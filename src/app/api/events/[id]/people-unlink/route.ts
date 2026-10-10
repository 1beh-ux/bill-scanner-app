import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isOrgAdmin } from "@/lib/org-scope";

// Event settings → Portál rodičů → "Odpojit od Lidé" (admin only).
// GET = how many of the event's participants are linked now.
// POST { action: "unlink" }: every participant loses its person link, the
// connection is switched off and the event is never linked again (not even by
// Lidé's "Propojit") -- participants and people both stay, nothing is sent.
// POST { action: "allow" }: linking allowed again (nothing is relinked here;
// switching "propojeno" on or Lidé's "Propojit" does that).
async function admin() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isOrgAdmin(user)) return NextResponse.json({ error: "admin_only" }, { status: 403 });
  return null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await admin();
  if (denied) return denied;
  const { id } = await params;
  const linked = await prisma.participant.count({ where: { eventId: id, childId: { not: null } } });
  return NextResponse.json({ linked });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await admin();
  if (denied) return denied;
  const { id } = await params;
  const { action } = await req.json().catch(() => ({}));
  const event = await prisma.event.findUnique({ where: { id }, select: { kind: true } });
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // A membership year is the module's own event -- always linked.
  if (event.kind === "membership") return NextResponse.json({ error: "membership" }, { status: 400 });

  if (action === "unlink") {
    const [res] = await prisma.$transaction([
      prisma.participant.updateMany({ where: { eventId: id, childId: { not: null } }, data: { childId: null } }),
      prisma.event.update({ where: { id }, data: { peopleUnlinked: true, registrationConnected: false } }),
    ]);
    return NextResponse.json({ ok: true, unlinked: res.count });
  }
  if (action === "allow") {
    await prisma.event.update({ where: { id }, data: { peopleUnlinked: false } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}
