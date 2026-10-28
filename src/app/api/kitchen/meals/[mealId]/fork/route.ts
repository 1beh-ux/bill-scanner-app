import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { libraryGuard } from "@/lib/kitchen/server";
import { saveMeal } from "@/lib/kitchen/library-server";

// "Vytvořit variantu jídla": a copy (lines, variants) that remembers where it came from; { name? }.
export async function POST(req: NextRequest, { params }: { params: Promise<{ mealId: string }> }) {
  const g = await libraryGuard();
  if ("error" in g) return g.error;
  const { mealId } = await params;
  const m = await prisma.meal.findFirst({ where: { id: mealId, organizationId: g.organizationId }, include: { ingredients: { orderBy: { sortOrder: "asc" } }, variants: true } });
  if (!m) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await saveMeal(g.organizationId, null, {
    ...m,
    name: typeof b.name === "string" && b.name.trim() ? b.name : `${m.name} (varianta)`,
    parentMealId: m.id,
    lines: m.ingredients.map((l) => ({ ingredientId: l.ingredientId, qtyPerAdultPortion: Number(l.qtyPerAdultPortion), role: l.role, optional: l.optional, note: l.note })),
    variants: m.variants.map((v) => ({ name: v.name, clearsAllergens: v.clearsAllergens, swaps: v.swaps })),
  });
  return "error" in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r, { status: 201 });
}
