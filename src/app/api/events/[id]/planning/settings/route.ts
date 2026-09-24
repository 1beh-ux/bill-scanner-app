import { NextRequest, NextResponse } from "next/server";
import { sanitizeDisplay } from "@/lib/planning";
import { sanitizeSheetStyle } from "@/lib/planning-sheet";
import { authorizePlanning, getPlanningSettings, updatePlanningSettings } from "@/lib/planning-server";

// Event-wide planning display + Google Sheet design (Nastavení akce -> Plánování).
// Anyone planning the event may change them; values are sanitized either way.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const denied = await authorizePlanning(eventId);
  if (denied) return denied;
  const s = await getPlanningSettings(eventId);
  return NextResponse.json({ display: sanitizeDisplay(s.display), sheetStyle: sanitizeSheetStyle(s.sheetStyle) });
}

// { display?, sheetStyle? } -- each replaces that section wholesale.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const denied = await authorizePlanning(eventId);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const next = await updatePlanningSettings(eventId, {
    ...(body.display !== undefined && { display: sanitizeDisplay(body.display) }),
    ...(body.sheetStyle !== undefined && { sheetStyle: sanitizeSheetStyle(body.sheetStyle) }),
  });
  return NextResponse.json({ display: sanitizeDisplay(next.display), sheetStyle: sanitizeSheetStyle(next.sheetStyle) });
}
