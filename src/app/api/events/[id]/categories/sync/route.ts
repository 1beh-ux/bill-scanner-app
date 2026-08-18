import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";

// Copies CategoryTemplate rows into this event's EventCategory list,
// skipping any name already present so it's safe to call more than once.
// Normally this happens automatically at event creation (see
// api/events/route.ts) -- this exists for events that already existed
// before a template was added.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;

  const [templates, existing] = await Promise.all([
    prisma.categoryTemplate.findMany(),
    prisma.eventCategory.findMany({ where: { eventId }, select: { name: true } }),
  ]);
  const existingNames = new Set(existing.map((e) => e.name));
  const toAdd = templates.filter((t) => !existingNames.has(t.name));

  if (toAdd.length > 0) {
    await prisma.eventCategory.createMany({
      data: toAdd.map((t) => ({
        eventId,
        name: t.name,
        description: t.description,
        budgetAmount: 0,
        isFromTemplate: true,
      })),
    });
  }

  return NextResponse.json({ added: toAdd.length });
}
