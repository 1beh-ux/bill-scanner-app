import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { libraryGuard } from "@/lib/kitchen/server";
import { ingredientInput } from "@/lib/kitchen/library-server";

// One ingredient: PATCH its fields ("Potvrdit alergeny" = { allergensConfirmed: true }); DELETE removes an
// unused one, a used one is only deactivated (meals and snapshots keep pointing at it).
const own = (organizationId: string, id: string) => prisma.ingredient.findFirst({ where: { id, organizationId }, select: { id: true, _count: { select: { mealUses: true } } } });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ ingredientId: string }> }) {
  const g = await libraryGuard();
  if ("error" in g) return g.error;
  const { ingredientId } = await params;
  if (!(await own(g.organizationId, ingredientId))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const input = ingredientInput((await req.json().catch(() => ({}))) as Record<string, unknown>, true);
  if (!input) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (input.nameKey) {
    const clash = await prisma.ingredient.findFirst({ where: { organizationId: g.organizationId, nameKey: input.nameKey, id: { not: ingredientId } }, select: { id: true } });
    if (clash) return NextResponse.json({ error: "duplicate" }, { status: 409 });
  }
  return NextResponse.json(await prisma.ingredient.update({ where: { id: ingredientId }, data: input }));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ ingredientId: string }> }) {
  const g = await libraryGuard();
  if ("error" in g) return g.error;
  const { ingredientId } = await params;
  const row = await own(g.organizationId, ingredientId);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (row._count.mealUses) {
    await prisma.ingredient.update({ where: { id: ingredientId }, data: { active: false } });
    return NextResponse.json({ deactivated: true });
  }
  await prisma.ingredient.delete({ where: { id: ingredientId } });
  return NextResponse.json({ deleted: true });
}
