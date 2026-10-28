import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { kitchenGuard } from "@/lib/kitchen/server";
import { snapshotEntries } from "@/lib/kitchen/snapshot";

// Kuchyně dnes: how it went -- PUT { verdict: short|ok|leftover, leftoverPercent?, shortPercent?, stars?, note? }.
// Recording it marks the entry cooked (snapshotting it first if it was still a draft). DELETE removes it.

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const { id, entryId } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  const entry = await prisma.planEntry.findFirst({ where: { id: entryId, eventId: id }, select: { id: true, status: true } });
  if (!entry) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (b.verdict !== "short" && b.verdict !== "ok" && b.verdict !== "leftover") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const pct = (v: unknown) => (v == null || v === "" ? null : Math.max(0, Math.min(100, Math.round(Number(v)) || 0)));
  const stars = b.stars == null ? null : Math.max(1, Math.min(5, Math.round(Number(b.stars)) || 1));
  const data = {
    verdict: b.verdict,
    leftoverPercent: b.verdict === "leftover" ? pct(b.leftoverPercent) : null,
    shortPercent: b.verdict === "short" ? pct(b.shortPercent) : null,
    stars,
    note: typeof b.note === "string" ? b.note.trim().slice(0, 2000) || null : null,
    recordedById: g.user.id,
    recordedAt: new Date(),
  } as const;
  if (entry.status === "draft") await snapshotEntries(g.event, [entry.id]);
  await prisma.$transaction([
    prisma.mealFeedback.upsert({ where: { planEntryId: entryId }, create: { planEntryId: entryId, ...data }, update: data }),
    prisma.planEntry.update({ where: { id: entryId }, data: { status: "cooked" } }),
  ]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const { id, entryId } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  const entry = await prisma.planEntry.findFirst({ where: { id: entryId, eventId: id }, select: { id: true } });
  if (!entry) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.mealFeedback.deleteMany({ where: { planEntryId: entryId } });
  await prisma.planEntry.update({ where: { id: entryId }, data: { status: "confirmed" } });
  return NextResponse.json({ ok: true });
}
