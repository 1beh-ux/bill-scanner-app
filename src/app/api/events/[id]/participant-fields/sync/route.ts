import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { syncParticipantFieldsForEvent } from "@/lib/participant-field-sync";

// Copies active org-wide ParticipantFieldTemplate rows into this event's
// EventParticipantField list, skipping any key already present -- same
// shape as categories/sync and list-items/sync. Synced fields start with
// their template's defaultSurfaces (adjust from the event's Účastníci
// settings tab afterward). Same sync also runs, scoped to one module's
// surfaces, when that module gets enabled -- see the modules PATCH route.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;

  const added = await syncParticipantFieldsForEvent(eventId);
  return NextResponse.json({ added });
}
