import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireListItemAccess } from "@/lib/module-access";

async function loadOwnedItem(eventId: string, itemId: string) {
  const item = await prisma.eventListItem.findUnique({ where: { id: itemId } });
  if (!item || item.eventId !== eventId) return null;
  return item;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId, itemId } = await params;

  const existing = await loadOwnedItem(eventId, itemId);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireListItemAccess(user, eventId, existing.kind);
  if (denied) return denied;

  const body = await req.json();
  const { name, key, sortOrder, active, data } = body;
  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }

  const updated = await prisma.eventListItem.update({
    where: { id: itemId },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(key !== undefined && { key: key || null }),
      ...(sortOrder !== undefined && { sortOrder: sortOrder ?? null }),
      ...(active !== undefined && { active }),
      ...(data !== undefined && { data }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId, itemId } = await params;

  const existing = await loadOwnedItem(eventId, itemId);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireListItemAccess(user, eventId, existing.kind);
  if (denied) return denied;

  try {
    await prisma.eventListItem.delete({ where: { id: itemId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json({ error: "item_in_use" }, { status: 409 });
    }
    throw err;
  }
}
