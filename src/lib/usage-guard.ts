import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireSuperAdmin } from "@/lib/org-scope";
import { sinceDays, type UsageFilter } from "@/lib/usage-queries";

/** /api/usage/*: super-admin only (403 for everyone else, 401 signed out) + the common filter. */
export async function usageGuard(req: NextRequest): Promise<{ error: NextResponse } | { filter: UsageFilter; userId: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const denied = requireSuperAdmin(user);
  if (denied) return { error: denied };
  const q = req.nextUrl.searchParams;
  const days = [0, 7, 30, 90, 365].includes(Number(q.get("days"))) ? Number(q.get("days")) : 30;
  return {
    userId: user.id,
    filter: { since: sinceDays(days), orgId: q.get("org") || null, eventId: q.get("event") || null, withSuper: q.get("withSuper") === "1" },
  };
}
