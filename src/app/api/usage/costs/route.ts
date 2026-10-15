import { NextRequest, NextResponse } from "next/server";
import { usageGuard } from "@/lib/usage-guard";
import { costEvent, costOrg, costOrgs } from "@/lib/usage-queries";
import { getPrices } from "@/lib/ai-usage";

// /vyuziti -> Náklady (super-admin): organizations; ?org= its events; ?event= one event.
export async function GET(req: NextRequest) {
  const g = await usageGuard(req);
  if ("error" in g) return g.error;
  const { since, orgId, eventId } = g.filter;
  const prices = await getPrices();
  if (eventId) {
    const data = await costEvent(eventId, since);
    if (!data.event) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ level: "event", prices, ...data });
  }
  if (orgId) {
    const data = await costOrg(orgId, since);
    if (!data.org) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ level: "org", prices, ...data });
  }
  return NextResponse.json({ level: "orgs", prices, ...(await costOrgs(since)) });
}
