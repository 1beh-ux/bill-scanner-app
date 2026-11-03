import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { normName } from "@/lib/travel-orders";
import { mapDistance } from "@/lib/route-distance";

// GET ?from=&to= (Bills access): km between two places -- a distance from earlier orders of the organization
// (either direction), else an estimate from the map (average of the routes found). Always just a suggestion.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;
  const from = (req.nextUrl.searchParams.get("from") ?? "").trim().slice(0, 200);
  const to = (req.nextUrl.searchParams.get("to") ?? "").trim().slice(0, 200);
  if (!from || !to || normName(from) === normName(to)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { organizationId } = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { organizationId: true } });
  const known = (await prisma.knownDistance.findMany({ where: { organizationId }, select: { fromPlace: true, toPlace: true, km: true } })).find(
    (d) => (normName(d.fromPlace) === normName(from) && normName(d.toPlace) === normName(to)) || (normName(d.fromPlace) === normName(to) && normName(d.toPlace) === normName(from)),
  );
  if (known) return NextResponse.json({ km: Number(known.km), source: "known" });
  const map = await mapDistance(from, to);
  return map ? NextResponse.json({ km: map.km, routes: map.routes, source: "map", fromLabel: map.fromLabel, toLabel: map.toLabel }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
