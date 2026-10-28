// Quantities and the learned sizing multiplier (docs/kitchen-planning-design.md). Pure.
// The multiplier is only ever a proposal: the plan uses it after a human clicks "Použít".

/** Q = quantity per standard adult portion × portions × the accepted multiplier (default 1). */
export const scaledQty = (qtyPerAdultPortion: number, portions: number, multiplier: number | null | undefined) => qtyPerAdultPortion * portions * (multiplier ?? 1);

export type FeedbackSample = { verdict: "short" | "ok" | "leftover"; leftoverPercent: number | null; shortPercent: number | null; eventId: string };

/** One sample's observed ratio: zbylo 20 % -> 0.8; chybělo (unspecified = 10 %) -> 1.1; akorát -> 1. */
export function observedRatio(s: Pick<FeedbackSample, "verdict" | "leftoverPercent" | "shortPercent">): number {
  if (s.verdict === "leftover") return 1 - (s.leftoverPercent ?? 0) / 100;
  if (s.verdict === "short") return 1 + (s.shortPercent ?? 10) / 100;
  return 1;
}

/** m = (n · mean(r) + k) / (n + k), k = 2, rounded to 2 decimals; with the evidence ("2 akce, 5 hodnocení"). */
export function learnedMultiplier(samples: FeedbackSample[], k = 2) {
  const n = samples.length;
  if (n === 0) return { multiplier: 1, samples: 0, events: 0 };
  const mean = samples.reduce((s, x) => s + observedRatio(x), 0) / n;
  return { multiplier: Math.round(((n * mean + k) / (n + k)) * 100) / 100, samples: n, events: new Set(samples.map((x) => x.eventId)).size };
}

/** For people: g ≥ 1000 -> kg with one decimal, ml ≥ 1000 -> l, ks rounded up to one decimal; else whole g / ml. */
export function formatQty(q: number, unit: "g" | "ml" | "ks"): { value: string; unit: string } {
  const one = (x: number) => (Math.round(x * 10) / 10).toLocaleString("cs-CZ", { maximumFractionDigits: 1 });
  if (unit === "ks") return { value: (Math.ceil(q * 10 - 1e-9) / 10).toLocaleString("cs-CZ", { maximumFractionDigits: 1 }), unit: "ks" };
  if (q >= 1000) return { value: one(q / 1000), unit: unit === "g" ? "kg" : "l" };
  return { value: Math.round(q).toLocaleString("cs-CZ"), unit };
}

export type QtyLine = { ingredientId: string; qtyPerAdultPortion: number };
export type SwapLine = { fromIngredientId: string; toIngredientId: string; qtyPerAdultPortion?: number | null };

/**
 * Total per ingredient for one plan entry: the recipe × portions × multiplier; an applied variant cooks its
 * `portions` special portions with its swaps (the "from" ingredient less, the "to" ingredient more).
 * ponytail: a special portion counts as 1.0 adult portion, whatever the eater's age band.
 */
export function entryTotals(lines: QtyLine[], portions: number, multiplier: number | null | undefined, variants: { swaps: SwapLine[]; portions: number }[] = []) {
  const m = multiplier ?? 1;
  const out = new Map<string, number>();
  const add = (id: string, q: number) => id && out.set(id, (out.get(id) ?? 0) + q);
  for (const l of lines) add(l.ingredientId, scaledQty(l.qtyPerAdultPortion, portions, m));
  for (const v of variants) {
    for (const s of v.swaps) {
      const base = lines.find((l) => l.ingredientId === s.fromIngredientId)?.qtyPerAdultPortion ?? 0;
      if (base) add(s.fromIngredientId, -scaledQty(base, v.portions, m));
      add(s.toIngredientId, scaledQty(s.qtyPerAdultPortion ?? base, v.portions, m));
    }
  }
  for (const [id, q] of out) if (q <= 1e-9) out.delete(id);
  return out;
}
