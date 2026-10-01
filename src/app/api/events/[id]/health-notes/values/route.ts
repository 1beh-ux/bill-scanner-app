import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { healthNotesByParticipant } from "@/lib/health-notes-server";
import { HEALTH_NOTE_PLACES, type HealthNotePlace } from "@/lib/health-notes";

// Resolved health notes for one place (?place=detail|meds|incident|pdf|list, or
// "all" -- every configured note, each with its places),
// for one participant (?participantId=) or the whole event.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "health");
  if (denied) return denied;
  const q = req.nextUrl.searchParams;
  const place = q.get("place") as HealthNotePlace | "all";
  if (place !== "all" && !HEALTH_NOTE_PLACES.includes(place)) return NextResponse.json({ error: "invalid_place" }, { status: 400 });
  const participantId = q.get("participantId");
  return NextResponse.json({ notes: await healthNotesByParticipant(eventId, place, participantId ? [participantId] : undefined) });
}
