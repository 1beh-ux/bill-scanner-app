import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { isOrgAdmin } from "@/lib/org-scope";
import { workerList } from "@/lib/travel-orders-server";
import { eventPeople, vehicleSelect } from "@/lib/vehicles-server";

// What the order form offers (Bills access): workers (adults + payers, one per person), the cars of the event's
// people, known distances (suggestions), the event's bills (to link the fuel receipt), the payers (payee).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true, organizationId: true, startDate: true, endDate: true } });
  const people = await eventPeople(eventId);
  const [workers, vehicles, distances, bills, payers] = await Promise.all([
    workerList(eventId),
    prisma.vehicle.findMany({ where: { organizationId: event.organizationId, archivedAt: null, OR: [{ ownerChildId: { in: people.childIds } }, { ownerAuthorId: { in: people.authorIds } }] }, select: vehicleSelect, orderBy: { label: "asc" } }),
    prisma.knownDistance.findMany({ where: { organizationId: event.organizationId }, select: { fromPlace: true, toPlace: true, km: true } }),
    prisma.bill.findMany({ where: { eventId, ingestChannel: { not: "travel_order" } }, select: { id: true, merchantName: true, billDate: true, totalAmount: true, originalFilename: true }, orderBy: { billDate: "desc" }, take: 300 }),
    prisma.authorEventAccess.findMany({ where: { eventId, author: { mergedIntoAuthorId: null } }, select: { author: { select: { id: true, canonicalName: true } } }, orderBy: { author: { canonicalName: "asc" } } }),
  ]);
  return NextResponse.json({ event, workers, vehicles, distances, bills, payers: payers.map((p) => p.author), admin: isOrgAdmin(user), userId: user.id });
}
