import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { fetchMedChecklistGrid } from "@/lib/med-checklist-grid";

// Thin route wrapper around fetchMedChecklistGrid -- see that function for
// the actual query shape. Also used by the PDF export route so the two
// can't drift.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "health");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const startParam = searchParams.get("startDate");
  const endParam = searchParams.get("endDate");
  if (!startParam || !endParam) {
    return NextResponse.json({ error: "date_range_required" }, { status: 400 });
  }
  const start = new Date(startParam);
  const end = new Date(endParam);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return NextResponse.json({ error: "invalid_date_range" }, { status: 400 });
  }

  const result = await fetchMedChecklistGrid(eventId, start, end);
  return NextResponse.json(result);
}
