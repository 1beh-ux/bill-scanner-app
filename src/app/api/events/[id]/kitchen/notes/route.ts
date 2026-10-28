import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { kitchenGuard } from "@/lib/kitchen/server";

// A meal's note from this event ("příště méně soli"): POST { mealId, body }; PATCH { noteId, toLibrary: true }
// "Převést do knihovny" (the note stays with the meal for every event); DELETE ?noteId=.
const ownNote = (eventId: string, noteId: unknown) => (typeof noteId === "string" ? prisma.mealNote.findFirst({ where: { id: noteId, eventId }, select: { id: true } }) : null);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const body = typeof b.body === "string" ? b.body.trim().slice(0, 2000) : "";
  const meal = typeof b.mealId === "string" ? await prisma.meal.findFirst({ where: { id: b.mealId, organizationId: g.event.organizationId }, select: { id: true } }) : null;
  if (!meal) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  return NextResponse.json(await prisma.mealNote.create({ data: { mealId: meal.id, eventId: id, body, authorUserId: g.user.id } }), { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const note = await ownNote(id, b.noteId);
  if (!note) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.mealNote.update({ where: { id: note.id }, data: { eventId: null, pinned: true } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  const note = await ownNote(id, new URL(req.url).searchParams.get("noteId"));
  if (!note) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.mealNote.delete({ where: { id: note.id } });
  return NextResponse.json({ ok: true });
}
