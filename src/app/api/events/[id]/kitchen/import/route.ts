import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { kitchenGuard } from "@/lib/kitchen/server";
import { readRecipes } from "@/lib/kitchen/ai-recipe";
import { nameKey, normalizeRecipe } from "@/lib/kitchen/import-normalize";
import { ALLERGEN_CODES, cleanCodes } from "@/lib/kitchen/allergens";

// Knihovna -> "Importovat recepty": an old recipe (xlsx / docx / pdf / photo) read by AI into meal drafts,
// per adult portion, matched to the library's ingredients. NOTHING is saved here: the preview shows every
// guess and "Uložit do knihovny" posts the edited draft to /api/kitchen/meals. AI allergens of new
// ingredients are suggestions only -- they are saved "neověřeno" until a person confirms them.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file_required" }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const r = await readRecipes(Buffer.from(await file.arrayBuffer()), file.name, { eventId: id, userId: g.user.id, purpose: "recipe_import" });
  if ("error" in r) return NextResponse.json(r, { status: r.error === "unsupported_file" || r.error === "empty_file" ? 400 : 502 });
  const known = await prisma.ingredient.findMany({ where: { organizationId: g.event.organizationId, active: true }, select: { id: true, name: true, nameKey: true, unit: true } });
  const existing = await prisma.meal.findMany({ where: { organizationId: g.event.organizationId, archivedAt: null }, select: { id: true, name: true, nameKey: true } });
  return NextResponse.json({
    notes: r.notes,
    drafts: r.recipes.slice(0, 50).map((raw) => {
      const d = normalizeRecipe(raw, known);
      const dup = existing.find((m) => m.nameKey === nameKey(d.name));
      return {
        ...d,
        duplicateOf: dup ? { id: dup.id, name: dup.name } : null,
        lines: d.lines.map((l, i) => ({ ...l, suggestedAllergens: l.ingredientId ? [] : cleanCodes(raw.ingredients?.filter((x) => x?.name?.trim())[i]?.allergens, ALLERGEN_CODES) })),
      };
    }),
  });
}
