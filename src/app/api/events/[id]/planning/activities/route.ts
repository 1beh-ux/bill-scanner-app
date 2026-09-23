import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { parseActivityInput } from "@/lib/planning-activities";

// Event activity library (Planning Helper). ?all=true includes inactive rows
// (the library editor); the board uses the default, active only.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "planning");
  if (denied) return denied;

  const all = new URL(req.url).searchParams.get("all") === "true";
  const activities = await prisma.planActivity.findMany({
    where: { eventId, ...(all ? {} : { active: true }) },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(activities);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "planning");
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const parsed = await parseActivityInput(eventId, body, false);
  if ("error" in parsed) return NextResponse.json(parsed, { status: 400 });

  const created = await prisma.planActivity.create({
    data: { ...parsed.data, eventId, name: parsed.data.name!, defaultDurationMin: parsed.data.defaultDurationMin! },
  });
  return NextResponse.json(created, { status: 201 });
}
