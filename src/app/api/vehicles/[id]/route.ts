import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId, isOrgAdmin, notFound } from "@/lib/org-scope";
import { requireModuleAccess } from "@/lib/module-access";
import { canEditVehicle, eventPeople, parseVehicle, vehicleSelect } from "@/lib/vehicles-server";

// PATCH one car: { archived: true|false } archives / restores it, anything else edits it. Organization admins
// any car; a user with Bills access on { eventId } only the cars they added (403 otherwise). Never deleted:
// orders keep their own snapshot, and an archived car is simply not offered any more.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const orgId = await getActingOrgId(user);
  const v = await prisma.vehicle.findFirst({ where: { id, organizationId: orgId }, select: { createdByUserId: true } });
  if (!v) return notFound();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const admin = isOrgAdmin(user);
  let people = null;
  if (!admin) {
    if (typeof b.eventId !== "string" || !b.eventId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const denied = await requireModuleAccess(user, b.eventId, "bills");
    if (denied) return denied;
    people = await eventPeople(b.eventId);
  }
  if (!canEditVehicle(user, v, admin)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (typeof b.archived === "boolean" && Object.keys(b).filter((k) => k !== "eventId").length === 1) {
    return NextResponse.json(await prisma.vehicle.update({ where: { id }, data: { archivedAt: b.archived ? new Date() : null }, select: vehicleSelect }));
  }
  const parsed = await parseVehicle(b, orgId, people);
  if ("notFound" in parsed) return notFound();
  if ("bad" in parsed) return NextResponse.json({ error: "bad_request", bad: parsed.bad }, { status: 400 });
  return NextResponse.json(await prisma.vehicle.update({ where: { id }, data: parsed.data, select: vehicleSelect }));
}
