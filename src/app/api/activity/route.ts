import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId } from "@/lib/org-scope";
import { cleanRoute, routeModule } from "@/lib/activity-route";

// Usage metrics: a signed-in user opened a page (src/components/ActivityTracker.tsx, sendBeacon).
// Body { path: route pattern, eventId? }. The event counts only when it's in the acting organization.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  let body: { path?: unknown; eventId?: unknown } = {};
  try {
    body = JSON.parse(await req.text());
  } catch {}
  const route = cleanRoute(body.path);
  if (!route) return new NextResponse(null, { status: 204 });
  const organizationId = await getActingOrgId(user);
  const eventId =
    typeof body.eventId === "string" && route.startsWith("/events/[id]") && (await prisma.event.count({ where: { id: body.eventId, organizationId } })) > 0
      ? body.eventId
      : null;
  await prisma.userActivity.create({ data: { userId: user.id, organizationId, eventId, route, module: routeModule(route) } });
  return new NextResponse(null, { status: 204 });
}
