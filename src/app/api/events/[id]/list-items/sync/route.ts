import { NextRequest, NextResponse } from "next/server";
import type { ListTemplateKind } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireListItemAccess } from "@/lib/module-access";

const ALLOWED_KINDS: ListTemplateKind[] = ["med", "slot", "situation", "document"];

// Copies active org-wide ListTemplate rows into this event's EventListItem
// list, skipping any name already present so it's safe to call more than
// once. Normally this happens automatically at event creation (see
// api/events/route.ts) -- this exists for events that already existed
// before a template was added, or before this event's Health module was
// set up at all.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;

  const body = await req.json().catch(() => ({}));
  const kind: ListTemplateKind | undefined = body.kind;
  if (!kind || !ALLOWED_KINDS.includes(kind)) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  const denied = await requireListItemAccess(user, eventId, kind);
  if (denied) return denied;

  const [templates, existing] = await Promise.all([
    prisma.listTemplate.findMany({ where: { kind, active: true } }),
    prisma.eventListItem.findMany({ where: { eventId, kind }, select: { name: true } }),
  ]);
  const existingNames = new Set(existing.map((e) => e.name));
  const toAdd = templates.filter((t) => !existingNames.has(t.name));

  if (toAdd.length > 0) {
    await prisma.eventListItem.createMany({
      data: toAdd.map((t) => ({
        eventId,
        kind: t.kind,
        key: t.key,
        name: t.name,
        sortOrder: t.sortOrder,
        data: t.data ?? undefined,
        isFromTemplate: true,
      })),
    });
  }

  return NextResponse.json({ added: toAdd.length });
}
