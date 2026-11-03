import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";

// Místa of the event's travel orders (Bills access): GET the list, POST { name } adds one, DELETE { name } removes it
// (legs keep their text).
async function guard(params: Promise<{ id: string }>): Promise<{ error: NextResponse } | { eventId: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  return denied ? { error: denied } : { eventId };
}
const list = (eventId: string) => prisma.travelPlace.findMany({ where: { eventId }, orderBy: { name: "asc" }, select: { id: true, name: true } });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(params);
  if ("error" in g) return g.error;
  return NextResponse.json(await list(g.eventId));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(params);
  if ("error" in g) return g.error;
  const b = await req.json().catch(() => ({}));
  const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ").slice(0, 200) : "";
  if (!name) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  await prisma.travelPlace.upsert({ where: { eventId_name: { eventId: g.eventId, name } }, update: {}, create: { eventId: g.eventId, name } });
  return NextResponse.json(await list(g.eventId));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(params);
  if ("error" in g) return g.error;
  const b = await req.json().catch(() => ({}));
  if (typeof b.name === "string") await prisma.travelPlace.deleteMany({ where: { eventId: g.eventId, name: b.name } });
  return NextResponse.json(await list(g.eventId));
}
