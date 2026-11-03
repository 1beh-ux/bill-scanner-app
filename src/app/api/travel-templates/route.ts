import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId } from "@/lib/org-scope";
import { requireModuleAccess } from "@/lib/module-access";
import { parseDraft } from "@/lib/travel-orders-server";

// Šablony cest, organization-wide. GET: the list (anyone signed in to the organization). POST { eventId, name,
// ...the order form }: saves the trip part (no worker / car / account) under that name, replacing one of the same
// name; needs Bills access on that event. Leg dates become day offsets from the trip's start.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json(
    await prisma.travelTemplate.findMany({ where: { organizationId: await getActingOrgId(user) }, orderBy: { name: "asc" }, select: { id: true, name: true, data: true, createdByUserId: true, updatedAt: true } }),
  );
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof b.eventId !== "string" || !b.eventId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const denied = await requireModuleAccess(user, b.eventId, "bills");
  if (denied) return denied;
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 120) : "";
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
  const { data, legs } = parseDraft(b);
  const start = data.startAt ? Date.parse(data.startAt.toISOString().slice(0, 10)) : null;
  const dec = (d: Prisma.Decimal | null) => (d === null ? "" : d.toString());
  const content = {
    purpose: data.purpose,
    originPlace: data.originPlace,
    destinationPlace: data.destinationPlace,
    roundTrip: data.roundTrip,
    legs: legs.map((l) => ({
      dayOffset: l.date && start !== null ? Math.round((l.date.getTime() - start) / 86400000) : 0,
      fromPlace: l.fromPlace ?? "",
      toPlace: l.toPlace ?? "",
      departTime: l.departTime ?? "",
      arriveTime: l.arriveTime ?? "",
      trailer: l.trailer,
      km: dec(l.km),
      stravne: dec(l.stravne),
      nocleh: dec(l.nocleh),
      vedlejsi: dec(l.vedlejsi),
    })),
  };
  const organizationId = await getActingOrgId(user);
  const t = await prisma.travelTemplate.upsert({
    where: { organizationId_name: { organizationId, name } },
    update: { data: content },
    create: { organizationId, name, data: content, createdByUserId: user.id },
    select: { id: true, name: true },
  });
  return NextResponse.json(t, { status: 201 });
}
