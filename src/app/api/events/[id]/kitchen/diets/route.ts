import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashText, kitchenContext, kitchenGuard } from "@/lib/kitchen/server";
import { ALLERGEN_CODES, cleanCodes } from "@/lib/kitchen/allergens";

// Strava účastníků: GET each participant's allergy text with the proposed mapping and their review status,
// the adults' data (read-only here, edited in Lidé); POST { participantId, allergens, dietFlags, note? } confirms
// (stores the text's hash: a later change of the text shows "změněno po potvrzení"); DELETE ?participantId= unconfirms.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  const ctx = await kitchenContext(g.event);
  const [fields, reviews, adults] = await Promise.all([
    prisma.eventParticipantField.findMany({ where: { eventId: id, active: true, kind: "custom" }, select: { key: true, label: true }, orderBy: { sortOrder: "asc" } }),
    prisma.participantDiet.findMany({ where: { participant: { eventId: id } }, select: { participantId: true, allergens: true, dietFlags: true, note: true, confirmedAt: true } }),
    prisma.eventPerson.findMany({ where: { eventId: id }, select: { id: true, eats: true, child: { select: { id: true, name: true, allergens: true, dietFlags: true, dietNote: true } } } }),
  ]);
  const review = new Map(reviews.map((r) => [r.participantId, r]));
  return NextResponse.json({
    allergyFieldKey: ctx.allergyFieldKey,
    fields,
    participants: ctx.diets.map((d) => {
      const participantId = d.key.slice(2);
      return { participantId, name: d.name, rawText: d.rawText, status: d.status, changed: d.changed, proposal: d.proposal, review: review.get(participantId) ?? null };
    }),
    adults: adults.map((a) => ({ id: a.id, childId: a.child.id, name: a.child.name, eats: a.eats, allergens: a.child.allergens, dietFlags: a.child.dietFlags, dietNote: a.child.dietNote })),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const p = typeof b.participantId === "string" ? await prisma.participant.findFirst({ where: { id: b.participantId, eventId: id }, select: { id: true, customFieldValues: true } }) : null;
  if (!p) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const ctx = await kitchenContext(g.event);
  const raw = ctx.allergyFieldKey ? String(((p.customFieldValues as Record<string, unknown> | null) ?? {})[ctx.allergyFieldKey] ?? "").trim() : "";
  const data = {
    allergens: cleanCodes(b.allergens, ALLERGEN_CODES),
    dietFlags: cleanCodes(b.dietFlags, ctx.dietDefs.map((d) => d.code)),
    note: typeof b.note === "string" ? b.note.trim().slice(0, 1000) || null : null,
    rawText: raw,
    rawTextHash: hashText(raw),
    confirmedById: g.user.id,
    confirmedAt: new Date(),
  };
  await prisma.participantDiet.upsert({ where: { participantId: p.id }, create: { participantId: p.id, ...data }, update: data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  const participantId = new URL(req.url).searchParams.get("participantId") ?? "";
  await prisma.participantDiet.deleteMany({ where: { participantId, participant: { eventId: id } } });
  return NextResponse.json({ ok: true });
}
