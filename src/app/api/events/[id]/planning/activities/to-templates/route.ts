import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { saveActivitiesAsTemplates } from "@/lib/planning-activities";
import { requireOrgAdminEvent } from "@/lib/org-scope";

// { activityIds } -> org base library. Admin only: templates are org-wide,
// same rule as /api/list-templates writes.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const access = await requireOrgAdminEvent(eventId);
  if ("error" in access) return access.error;

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.activityIds) ? body.activityIds.filter((x: unknown): x is string => typeof x === "string").slice(0, 500) : [];
  if (ids.length === 0) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  return NextResponse.json(await saveActivitiesAsTemplates(eventId, ids));
}
