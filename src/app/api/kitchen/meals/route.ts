import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { libraryGuard } from "@/lib/kitchen/server";
import { saveMeal } from "@/lib/kitchen/library-server";
import { mealProfile } from "@/lib/kitchen/allergens";

// Knihovna -> Jídla: GET (?archived=1 the archive) with derived allergens; POST a new meal (lines, variants).
export async function GET(req: NextRequest) {
  const g = await libraryGuard();
  if ("error" in g) return g.error;
  const archived = new URL(req.url).searchParams.get("archived") === "1";
  const meals = await prisma.meal.findMany({
    where: { organizationId: g.organizationId, archivedAt: archived ? { not: null } : null },
    include: { ingredients: { include: { ingredient: true } }, variants: { select: { id: true, name: true } }, _count: { select: { planEntries: true } } },
    orderBy: { nameKey: "asc" },
  });
  return NextResponse.json(
    meals.map((m) => {
      const prof = mealProfile(m.ingredients.map((l) => ({ ingredientId: l.ingredientId, qty: Number(l.qtyPerAdultPortion) })), new Map(m.ingredients.map((l) => [l.ingredientId, l.ingredient])));
      return { id: m.id, name: m.name, mealType: m.mealType, tags: m.tags, yieldPortions: m.yieldPortions, archivedAt: m.archivedAt, ingredients: m.ingredients.length, variants: m.variants, uses: m._count.planEntries, allergens: [...prof.allergens], content: [...prof.content], unconfirmed: prof.unconfirmed, parentMealId: m.parentMealId };
    })
  );
}

export async function POST(req: NextRequest) {
  const g = await libraryGuard();
  if ("error" in g) return g.error;
  const r = await saveMeal(g.organizationId, null, (await req.json().catch(() => ({}))) as Record<string, unknown>);
  return "error" in r ? NextResponse.json(r, { status: r.error === "not_found" ? 404 : 400 }) : NextResponse.json(r, { status: 201 });
}
