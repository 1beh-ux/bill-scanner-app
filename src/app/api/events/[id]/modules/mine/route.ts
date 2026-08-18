import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getEnabledModules, hasModuleAccess } from "@/lib/module-access";

// Used by the sidebar to decide which module nav items to show: only
// modules that are both enabled for this event AND granted to this user
// (or covered by their role shortcut) come back true.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;

  const enabledModules = await getEnabledModules(eventId);
  const accessible: Record<string, boolean> = {};
  for (const key of enabledModules) {
    accessible[key] = await hasModuleAccess(user, eventId, key);
  }

  return NextResponse.json(accessible);
}
