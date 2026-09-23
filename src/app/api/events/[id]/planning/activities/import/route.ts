import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { copyActivitiesFromEvent, importBaseActivities } from "@/lib/planning-activities";

// Bulk-fill the event activity library:
//   { source: "base", templateIds?: string[] }  -- from the org base library
//   { source: "event", fromEventId: string }     -- copy another event's library
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "planning");
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  if (body.source === "base") {
    const templateIds = Array.isArray(body.templateIds)
      ? body.templateIds.filter((x: unknown): x is string => typeof x === "string")
      : undefined;
    return NextResponse.json(await importBaseActivities(eventId, templateIds));
  }

  if (body.source === "event" && typeof body.fromEventId === "string" && body.fromEventId !== eventId) {
    // Reading the source library needs planning access there too.
    const deniedSource = await requireModuleAccess(user, body.fromEventId, "planning");
    if (deniedSource) return deniedSource;
    return NextResponse.json(await copyActivitiesFromEvent(eventId, body.fromEventId));
  }

  return NextResponse.json({ error: "invalid_body" }, { status: 400 });
}
