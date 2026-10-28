// The plan as the screens see it: each entry with its headcount, portions, allergen check, the learned
// sizing proposal and quantities -- live for a draft, from the snapshot once confirmed or cooked.
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { entryConflicts, type IngredientInfo, type Swap, type VariantInfo } from "./allergens";
import { headcount } from "./headcount";
import { entryTotals, learnedMultiplier } from "./sizing";
import { iso, type KitchenContext } from "./server";

const mealInclude = {
  ingredients: { include: { ingredient: true }, orderBy: { sortOrder: "asc" } },
  variants: true,
} satisfies Prisma.MealInclude;
type MealFull = Prisma.MealGetPayload<{ include: typeof mealInclude }>;

export type SnapshotLine = { ingredientId: string; name: string; unit: string; qty: number; storeHint: string | null; category: string | null };
export type Snapshot = {
  mealName: string;
  steps: string | null;
  portions: number;
  multiplier: number | null;
  participants: number;
  adults: number;
  extra: number;
  variants: { id: string; name: string; portions: number; names: string[] }[];
  lines: SnapshotLine[];
  allergens: string[];
};

const variantInfo = (v: MealFull["variants"][number]): VariantInfo => ({ id: v.id, name: v.name, clearsAllergens: v.clearsAllergens, swaps: (Array.isArray(v.swaps) ? v.swaps : []) as Swap[] });

export async function loadPlan(ctx: KitchenContext, eventId: string, organizationId: string, where: Prisma.PlanEntryWhereInput = {}) {
  const entries = await prisma.planEntry.findMany({ where: { eventId, ...where }, include: { meal: { include: mealInclude }, feedback: true }, orderBy: [{ date: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }] });
  // Swapped-in ingredients (variants) are looked up too.
  const swapIds = new Set<string>();
  for (const e of entries) for (const v of e.meal?.variants ?? []) for (const s of variantInfo(v).swaps) if (s.toIngredientId) swapIds.add(s.toIngredientId);
  const ingRows = new Map<string, { id: string; name: string; unit: string; allergens: string[]; dietFlags: string[]; allergensConfirmed: boolean; storeHint: string | null; category: string | null }>();
  for (const e of entries) for (const l of e.meal?.ingredients ?? []) ingRows.set(l.ingredient.id, l.ingredient);
  const missing = [...swapIds].filter((id) => !ingRows.has(id));
  if (missing.length) for (const i of await prisma.ingredient.findMany({ where: { id: { in: missing }, organizationId } })) ingRows.set(i.id, i);
  const ingInfo = new Map<string, IngredientInfo>([...ingRows].map(([id, i]) => [id, i]));

  // The learned multiplier per meal, from every feedback on it in this organization.
  const mealIds = [...new Set(entries.map((e) => e.mealId).filter((x): x is string => !!x))];
  const feedback = mealIds.length
    ? await prisma.mealFeedback.findMany({ where: { planEntry: { mealId: { in: mealIds }, meal: { organizationId } } }, select: { verdict: true, leftoverPercent: true, shortPercent: true, planEntry: { select: { mealId: true, eventId: true } } } })
    : [];
  const learned = new Map(mealIds.map((id) => [id, learnedMultiplier(feedback.filter((f) => f.planEntry.mealId === id).map((f) => ({ ...f, eventId: f.planEntry.eventId })))]));

  const diets = new Map([...ctx.diets, ...ctx.adultDiets].map((d) => [d.key, d]));
  return entries.map((e) => {
    const date = iso(e.date);
    const hc = headcount(date, e.slotItemId, ctx.hc);
    const portions = e.headcountMode === "manual" && e.manualPortions != null ? Number(e.manualPortions) : hc.portions;
    const multiplier = e.sizingMultiplier == null ? null : Number(e.sizingMultiplier);
    const meal = e.meal;
    const lines = (meal?.ingredients ?? []).map((l) => ({ ingredientId: l.ingredientId, qty: Number(l.qtyPerAdultPortion), optional: l.optional }));
    const variants = (meal?.variants ?? []).map(variantInfo);
    const present = hc.people.map((p) => diets.get(`${p.kind === "adult" ? "a" : "p"}:${p.id}`)).filter((d): d is NonNullable<typeof d> => !!d);
    const check = meal ? entryConflicts(lines, ingInfo, variants, e.variantIds, present) : null;
    const special = (check?.specialPortions ?? []).filter((s) => s.applied);
    const live = (): Snapshot => {
      const totals = entryTotals(
        lines.map((l) => ({ ingredientId: l.ingredientId, qtyPerAdultPortion: l.qty })),
        portions,
        multiplier,
        special.map((s) => ({ swaps: variants.find((v) => v.id === s.variantId)?.swaps ?? [], portions: s.names.length }))
      );
      return {
        mealName: meal?.name ?? e.customName ?? "",
        steps: meal?.steps ?? null,
        portions,
        multiplier,
        participants: hc.participants,
        adults: hc.adults,
        extra: hc.extra,
        variants: special.map((s) => ({ id: s.variantId, name: s.variantName, portions: s.names.length, names: s.names })),
        lines: [...totals].map(([id, qty]) => {
          const i = ingRows.get(id);
          return { ingredientId: id, name: i?.name ?? "?", unit: i?.unit ?? "g", qty, storeHint: i?.storeHint ?? null, category: i?.category ?? null };
        }),
        allergens: check?.allergens ?? [],
      };
    };
    const snapshot = e.status !== "draft" && e.recipeSnapshot ? (e.recipeSnapshot as unknown as Snapshot) : null;
    const l = e.mealId ? learned.get(e.mealId) : undefined;
    return {
      id: e.id,
      date,
      slotItemId: e.slotItemId,
      mealId: e.mealId,
      name: meal?.name ?? e.customName ?? "",
      archived: !!meal?.archivedAt,
      status: e.status,
      variantIds: e.variantIds,
      headcountMode: e.headcountMode,
      manualPortions: e.manualPortions == null ? null : Number(e.manualPortions),
      servingTime: e.servingTime,
      note: e.note,
      multiplier,
      headcount: { participants: hc.participants, adults: hc.adults, extra: hc.extra, eaters: hc.eaters, portions: hc.portions, missingDob: hc.missingDob },
      portions,
      check,
      // Shown with its evidence; the entry changes only on "Použít".
      proposal: l && l.samples > 0 && l.multiplier !== 1 && l.multiplier !== multiplier ? l : null,
      variants: variants.map((v) => ({ id: v.id, name: v.name })),
      feedback: e.feedback,
      sheet: snapshot ?? live(),
      fromSnapshot: !!snapshot,
      liveSheet: live,
    };
  });
}
export type PlanRow = Awaited<ReturnType<typeof loadPlan>>[number];
/** Without the function, for JSON. */
export const planJson = (rows: PlanRow[]) => rows.map(({ liveSheet: _l, ...r }) => r);
