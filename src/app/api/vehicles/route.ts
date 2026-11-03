import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId, isOrgAdmin } from "@/lib/org-scope";
import { requireModuleAccess } from "@/lib/module-access";
import type { User } from "@/generated/prisma";
import { eventPeople, parseVehicle, vehicleSelect } from "@/lib/vehicles-server";

// Vozidla. GET ?eventId= (a user with Bills access there: the cars of the event's people) or, for an
// organization admin without it, every car (?archived=1 with the archived ones). POST: a new car
// ({ eventId } required for a non-admin; the owner must be one of that event's people).
type Scope = { error: NextResponse } | { user: User; orgId: string; admin: boolean; people: Awaited<ReturnType<typeof eventPeople>> | null };
async function scope(req: NextRequest, eventId: string | null): Promise<Scope> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const orgId = await getActingOrgId(user);
  const admin = isOrgAdmin(user);
  if (eventId) {
    const denied = await requireModuleAccess(user, eventId, "bills");
    if (denied) return { error: denied };
  } else if (!admin) return { error: NextResponse.json({ error: "admin_only" }, { status: 403 }) };
  return { user, orgId, admin, people: eventId ? await eventPeople(eventId) : null };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const s = await scope(req, q.get("eventId"));
  if ("error" in s) return s.error;
  const vehicles = await prisma.vehicle.findMany({
    where: {
      organizationId: s.orgId,
      ...(q.get("archived") === "1" && s.admin ? {} : { archivedAt: null }),
      ...(s.people && { OR: [{ ownerChildId: { in: s.people.childIds } }, { ownerAuthorId: { in: s.people.authorIds } }, ...(s.admin ? [{ ownerChildId: null, ownerAuthorId: null }] : [])] }),
    },
    select: vehicleSelect,
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { label: "asc" }],
  });
  return NextResponse.json({ vehicles, admin: s.admin, userId: s.user.id });
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const s = await scope(req, typeof b.eventId === "string" && b.eventId ? b.eventId : null);
  if ("error" in s) return s.error;
  const parsed = await parseVehicle(b, s.orgId, s.admin ? null : s.people);
  if ("notFound" in parsed) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if ("bad" in parsed) return NextResponse.json({ error: "bad_request", bad: parsed.bad }, { status: 400 });
  const v = await prisma.vehicle.create({ data: { ...parsed.data, organizationId: s.orgId, createdByUserId: s.user.id }, select: vehicleSelect });
  return NextResponse.json(v, { status: 201 });
}
