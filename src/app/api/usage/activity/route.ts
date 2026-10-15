import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { usageGuard } from "@/lib/usage-guard";
import { activityOfUser, activityOverview } from "@/lib/usage-queries";

// /vyuziti -> Aktivita (super-admin). ?user=<id>: one user's detail.
export async function GET(req: NextRequest) {
  const g = await usageGuard(req);
  if ("error" in g) return g.error;
  const userId = req.nextUrl.searchParams.get("user");
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, displayName: true, email: true, organization: { select: { name: true } } } });
    if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ user, ...(await activityOfUser(userId, g.filter)) });
  }
  const [data, events] = await Promise.all([
    activityOverview(g.filter),
    g.filter.orgId ? prisma.event.findMany({ where: { organizationId: g.filter.orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
  ]);
  return NextResponse.json({ ...data, events });
}
