// Fields Manager API access (phase 2): signed in, organization admin, organization flag on. Anything else looks
// like the page doesn't exist (404), so the flag stays invisible while off.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId, isOrgAdmin } from "@/lib/org-scope";
import { hasFeature } from "@/lib/org-features";
import { prisma } from "@/lib/prisma";

export async function fieldsManagerAccess(): Promise<{ error: NextResponse } | { organizationId: string; userId: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const organizationId = await getActingOrgId(user);
  if (!isOrgAdmin(user) || !(await hasFeature(organizationId, "fields_manager"))) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  return { organizationId, userId: user.id };
}

/** The requested event if it belongs to the organization, else its most relevant one (latest start). */
export async function pickEvent(organizationId: string, requested: string | null) {
  const events = await prisma.event.findMany({
    where: { organizationId },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, startDate: true, endDate: true, kind: true, status: true, isTest: true },
  });
  const selected = events.find((e) => e.id === requested) ?? events.find((e) => e.status === "active" && !e.isTest) ?? events[0] ?? null;
  return { events, selected };
}
