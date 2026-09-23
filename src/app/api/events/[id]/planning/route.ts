import { NextRequest, NextResponse } from "next/server";
import { authorizePlanning, loadPlanPayload } from "@/lib/planning-server";

// The whole event plan + lists in one payload -- the board holds it all and
// recomputes times client-side (src/lib/planning-engine.ts).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const denied = await authorizePlanning(eventId);
  if (denied) return denied;
  return NextResponse.json(await loadPlanPayload(eventId));
}
