import { NextRequest, NextResponse } from "next/server";
import type { ListTemplateKind } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";

const ALLOWED_KINDS: ListTemplateKind[] = ["med", "slot", "situation"];

// Read-only slice of the generic EventListItem table (see the ListTemplate/
// EventListItem design in Milestone 1) -- just enough for the incident form
// to pull event_meds / event_situation_templates. The admin CRUD for
// creating/editing these lists is Milestone 5, not built yet, so this
// returns an empty array on any event that hasn't been set up.
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
  const kind = searchParams.get("kind") as ListTemplateKind | null;
  if (!kind || !ALLOWED_KINDS.includes(kind)) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }

  const items = await prisma.eventListItem.findMany({
    where: { eventId, kind, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(items);
}
