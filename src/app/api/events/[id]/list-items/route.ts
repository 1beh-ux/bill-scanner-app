import { NextRequest, NextResponse } from "next/server";
import type { ListTemplateKind } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireListItemAccess } from "@/lib/module-access";

const ALLOWED_KINDS: ListTemplateKind[] = ["med", "slot", "situation", "document"];

// Slice of the generic EventListItem table (see the ListTemplate/
// EventListItem design in Milestone 1) -- used both by the incident form
// (active items only, the default) and the event's "Zdraví" admin tab
// (?all=true, so inactive items can be reactivated).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;

  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind") as ListTemplateKind | null;
  const all = searchParams.get("all") === "true";
  if (!kind || !ALLOWED_KINDS.includes(kind)) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  const denied = await requireListItemAccess(user, eventId, kind);
  if (denied) return denied;

  const items = await prisma.eventListItem.findMany({
    where: { eventId, kind, ...(all ? {} : { active: true }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(items);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;

  const body = await req.json();
  const kind: ListTemplateKind | undefined = body.kind;
  const { name, key, sortOrder, data } = body;
  if (!kind || !ALLOWED_KINDS.includes(kind)) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  const denied = await requireListItemAccess(user, eventId, kind);
  if (denied) return denied;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }

  const created = await prisma.eventListItem.create({
    data: {
      eventId,
      kind,
      name: name.trim(),
      key: key || null,
      sortOrder: sortOrder ?? null,
      data: data ?? undefined,
      isFromTemplate: false,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
