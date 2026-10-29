// Knihovna (org-owned meals and ingredients): input cleaning and the meal save shared by the editor and
// the AI import's "Uložit do knihovny".
import { prisma } from "@/lib/prisma";
import { ALLERGEN_CODES, cleanCodes, cleanIngredientFlags } from "./allergens";
import { nameKey } from "./import-normalize";

const text = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const UNITS = ["g", "ml", "ks"] as const;
type Unit = (typeof UNITS)[number];
const unitOf = (v: unknown): Unit | null => (UNITS.includes(v as Unit) ? (v as Unit) : null);
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : NaN);

/** Ingredient fields from a request; null = invalid. allergensConfirmed only ever comes from a person's click. */
export function ingredientInput(b: Record<string, unknown>, partial = false) {
  const name = text(b.name);
  const unit = unitOf(b.unit);
  if (!partial && (!name || !unit)) return null;
  if (partial && ((b.name !== undefined && !name) || (b.unit !== undefined && !unit))) return null;
  const packSize = num(b.packSize);
  const shelf = num(b.shelfLifeDays);
  const altQty = num(b.altUnitQty);
  if (Number.isNaN(packSize) || Number.isNaN(shelf) || Number.isNaN(altQty) || (altQty != null && !(altQty > 0 && altQty < 100000))) return null;
  const pick = <T>(k: string, v: T) => (b[k] === undefined ? {} : { [k]: v });
  return {
    ...(name && { name, nameKey: nameKey(name) }),
    ...(unit && { unit }),
    ...pick("allergens", cleanCodes(b.allergens, ALLERGEN_CODES)),
    ...pick("dietFlags", cleanIngredientFlags(b.dietFlags)),
    ...pick("pantry", b.pantry === true),
    ...pick("altUnitName", text(b.altUnitName, 30) || null),
    ...pick("altUnitQty", altQty),
    ...pick("allergensConfirmed", b.allergensConfirmed === true),
    ...pick("packSize", packSize),
    ...pick("packUnit", text(b.packUnit, 20) || null),
    ...pick("shelfLifeDays", shelf == null ? null : Math.round(shelf)),
    ...pick("storeHint", text(b.storeHint, 100) || null),
    ...pick("category", text(b.category, 100) || null),
    ...pick("active", b.active !== false),
  };
}

type LineIn = { ingredientId?: unknown; newIngredient?: unknown; qtyPerAdultPortion?: unknown; role?: unknown; optional?: unknown; note?: unknown };
type VariantIn = { name?: unknown; clearsAllergens?: unknown; swaps?: unknown };

/**
 * Create (mealId null) or replace a meal with its lines and variants. New ingredients typed in the editor or
 * found by the import are created unconfirmed ("neověřeno") -- or reused when the name already exists.
 * Returns the id, or an error code.
 */
export async function saveMeal(organizationId: string, mealId: string | null, b: Record<string, unknown>): Promise<{ id: string } | { error: string }> {
  const name = text(b.name);
  if (!name) return { error: "name_required" };
  const yieldPortions = Math.round(Number(b.yieldPortions ?? 10));
  if (!(yieldPortions >= 1 && yieldPortions <= 10000)) return { error: "bad_request" };
  const lines = (Array.isArray(b.lines) ? b.lines : []) as LineIn[];
  const variants = (Array.isArray(b.variants) ? b.variants : []) as VariantIn[];
  const minutes = (v: unknown) => (v == null || v === "" ? null : Math.max(0, Math.min(10000, Math.round(Number(v)) || 0)));

  return prisma.$transaction(async (tx) => {
    // Resolve every line's ingredient inside the organization.
    const resolved: { ingredientId: string; qty: number; role: string | null; optional: boolean; note: string | null }[] = [];
    for (const l of lines) {
      const qty = Number(l.qtyPerAdultPortion);
      if (!(Number.isFinite(qty) && qty >= 0 && qty < 100000)) return { error: "bad_qty" };
      let ingredientId: string | null = null;
      if (typeof l.ingredientId === "string" && l.ingredientId) {
        ingredientId = (await tx.ingredient.findFirst({ where: { id: l.ingredientId, organizationId }, select: { id: true } }))?.id ?? null;
        if (!ingredientId) return { error: "not_found" };
      } else if (l.newIngredient && typeof l.newIngredient === "object") {
        const n = l.newIngredient as Record<string, unknown>;
        const input = ingredientInput({ ...n, allergensConfirmed: false });
        if (!input) return { error: "bad_ingredient" };
        const found = await tx.ingredient.findUnique({ where: { organizationId_nameKey: { organizationId, nameKey: input.nameKey! } }, select: { id: true } });
        ingredientId = found?.id ?? (await tx.ingredient.create({ data: { ...(input as { name: string; nameKey: string; unit: Unit }), organizationId, allergensConfirmed: false }, select: { id: true } })).id;
      } else return { error: "bad_request" };
      resolved.push({ ingredientId, qty, role: text(l.role, 30) || null, optional: l.optional === true, note: text(l.note, 500) || null });
    }
    const variantRows = [];
    for (const v of variants) {
      const vname = text(v.name, 100);
      if (!vname) continue;
      const swaps = [];
      // A swap may name a line of this meal (fromLineIndex: an ingredient that is new right now, in the editor or
      // the import) and a new ingredient to swap in (toNewIngredient: created unconfirmed, or reused by name).
      for (const s of (Array.isArray(v.swaps) ? v.swaps : []) as Record<string, unknown>[]) {
        const from = typeof s.fromLineIndex === "number" ? resolved[s.fromLineIndex]?.ingredientId : s.fromIngredientId;
        let to = s.toIngredientId;
        if (s.toNewIngredient && typeof s.toNewIngredient === "object") {
          const input = ingredientInput({ ...(s.toNewIngredient as Record<string, unknown>), allergensConfirmed: false });
          if (!input) return { error: "bad_ingredient" };
          to =
            (await tx.ingredient.findUnique({ where: { organizationId_nameKey: { organizationId, nameKey: input.nameKey! } }, select: { id: true } }))?.id ??
            (await tx.ingredient.create({ data: { ...(input as { name: string; nameKey: string; unit: Unit }), organizationId, allergensConfirmed: false }, select: { id: true } })).id;
        }
        const ids = [from, to].filter((x): x is string => typeof x === "string" && !!x);
        if (ids.length !== 2 || (await tx.ingredient.count({ where: { id: { in: ids }, organizationId } })) !== new Set(ids).size) return { error: "not_found" };
        const q = num(s.qtyPerAdultPortion);
        swaps.push({ fromIngredientId: ids[0], toIngredientId: ids[1], qtyPerAdultPortion: q == null || Number.isNaN(q) ? null : q });
      }
      variantRows.push({ name: vname, clearsAllergens: cleanCodes(v.clearsAllergens, ALLERGEN_CODES), swaps });
    }
    const data = {
      name,
      nameKey: nameKey(name),
      mealType: text(b.mealType, 60) || null,
      yieldPortions,
      prepMinutes: minutes(b.prepMinutes),
      cookMinutes: minutes(b.cookMinutes),
      equipment: text(b.equipment, 500) || null,
      prepAheadOk: b.prepAheadOk === true,
      leftoverFriendly: b.leftoverFriendly === true,
      coldPackable: b.coldPackable === true,
      tags: (Array.isArray(b.tags) ? b.tags : []).map((t) => text(t, 40)).filter(Boolean).slice(0, 20),
      steps: text(b.steps, 20000) || null,
    };
    let id = mealId;
    if (id) {
      if (!(await tx.meal.findFirst({ where: { id, organizationId }, select: { id: true } }))) return { error: "not_found" };
      await tx.meal.update({ where: { id }, data });
      await tx.mealIngredient.deleteMany({ where: { mealId: id } });
      await tx.mealVariant.deleteMany({ where: { mealId: id } });
    } else {
      const parent = typeof b.parentMealId === "string" ? await tx.meal.findFirst({ where: { id: b.parentMealId, organizationId }, select: { id: true } }) : null;
      id = (await tx.meal.create({ data: { ...data, organizationId, parentMealId: parent?.id ?? null }, select: { id: true } })).id;
    }
    await tx.mealIngredient.createMany({ data: resolved.map((r, i) => ({ mealId: id!, ingredientId: r.ingredientId, qtyPerAdultPortion: r.qty, role: r.role, optional: r.optional, note: r.note, sortOrder: i })) });
    if (variantRows.length) await tx.mealVariant.createMany({ data: variantRows.map((v) => ({ mealId: id!, ...v })) });
    return { id: id! };
  });
}
