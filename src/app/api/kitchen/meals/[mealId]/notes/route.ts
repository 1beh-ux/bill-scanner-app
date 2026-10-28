import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { libraryGuard } from "@/lib/kitchen/server";

// A meal's library notes (shown on every event): POST { body }, DELETE ?noteId= (also an event's note of this
// organization), PATCH { noteId, pinned }.
const meal = (organizationId: string, id: string) => prisma.meal.findFirst({ where: { id, organizationId }, select: { id: true } });
const note = (mealId: string, organizationId: string, noteId: unknown) =>
  typeof noteId === "string" ? prisma.mealNote.findFirst({ where: { id: noteId, mealId, OR: [{ eventId: null }, { event: { organizationId } }] }, select: { id: true } }) : null;

export async function POST(req: NextRequest, { params }: { params: Promise<{ mealId: string }> }) {
  const g = await libraryGuard();
  if ("error" in g) return g.error;
  const { mealId } = await params;
  if (!(await meal(g.organizationId, mealId))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const body = typeof b.body === "string" ? b.body.trim().slice(0, 2000) : "";
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  return NextResponse.json(await prisma.mealNote.create({ data: { mealId, body, authorUserId: g.user.id, pinned: true } }), { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ mealId: string }> }) {
  const g = await libraryGuard();
  if ("error" in g) return g.error;
  const { mealId } = await params;
  if (!(await meal(g.organizationId, mealId))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const n = await note(mealId, g.organizationId, b.noteId);
  if (!n) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.mealNote.update({ where: { id: n.id }, data: { pinned: b.pinned === true } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ mealId: string }> }) {
  const g = await libraryGuard();
  if ("error" in g) return g.error;
  const { mealId } = await params;
  if (!(await meal(g.organizationId, mealId))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const n = await note(mealId, g.organizationId, new URL(req.url).searchParams.get("noteId"));
  if (!n) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.mealNote.delete({ where: { id: n.id } });
  return NextResponse.json({ ok: true });
}
