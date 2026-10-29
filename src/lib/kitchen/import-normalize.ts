// AI recipe import: turn what Gemini read from an old recipe (xlsx/docx/pdf/photo) into a library meal draft.
// Pure. Nothing is saved here; the preview shows every guess and a human confirms.
import { normalizeText } from "./allergens";

/** The library key of a name: "Mouka  Hladká" -> "mouka hladka" (Ingredient.nameKey, Meal.nameKey). */
export const nameKey = (name: string) => normalizeText(name);

// What the AI may add per ingredient: allergens, contains (content flags), pantry ("always in the kitchen"),
// category. Per recipe: type, times, equipment, tags, flags, variants (by ingredient names). All suggestions.
export type RawLine = { name: string; qty: number | string | null; unit: string | null; note?: string | null; allergens?: unknown; contains?: unknown; pantry?: unknown; category?: unknown };
export type RawVariant = { name?: unknown; swaps?: { from?: unknown; to?: unknown }[] | unknown };
export type RawRecipe = {
  name: string;
  servings: number | string | null;
  ingredients: RawLine[];
  steps?: string | string[] | null;
  mealType?: string | null;
  meal_type?: string | null;
  prep_minutes?: unknown;
  cook_minutes?: unknown;
  equipment?: unknown;
  tags?: unknown;
  prep_ahead_ok?: unknown;
  leftover_friendly?: unknown;
  cold_packable?: unknown;
  variants?: RawVariant[] | unknown;
};
export type KnownIngredient = { id: string; name: string; nameKey: string; unit: "g" | "ml" | "ks"; pantry?: boolean; altUnitName?: string | null; altUnitQty?: number | null };

// Metric units -> the base unit.
const METRIC: Record<string, { unit: "g" | "ml" | "ks"; factor: number }> = {
  g: { unit: "g", factor: 1 }, gr: { unit: "g", factor: 1 }, gram: { unit: "g", factor: 1 }, gramu: { unit: "g", factor: 1 },
  dkg: { unit: "g", factor: 10 }, dag: { unit: "g", factor: 10 },
  kg: { unit: "g", factor: 1000 }, kilo: { unit: "g", factor: 1000 },
  ml: { unit: "ml", factor: 1 }, cl: { unit: "ml", factor: 10 }, dl: { unit: "ml", factor: 100 }, l: { unit: "ml", factor: 1000 }, litr: { unit: "ml", factor: 1000 }, litru: { unit: "ml", factor: 1000 },
  ks: { unit: "ks", factor: 1 }, kus: { unit: "ks", factor: 1 }, kusy: { unit: "ks", factor: 1 }, kusu: { unit: "ks", factor: 1 }, pcs: { unit: "ks", factor: 1 },
};
// Household units: an estimate, always flagged for checking.
const HOUSEHOLD: Record<string, { unit: "g" | "ml" | "ks"; factor: number }> = {
  lzice: { unit: "ml", factor: 15 }, pl: { unit: "ml", factor: 15 }, lzic: { unit: "ml", factor: 15 },
  lzicka: { unit: "ml", factor: 5 }, kl: { unit: "ml", factor: 5 }, lzicky: { unit: "ml", factor: 5 }, lzicek: { unit: "ml", factor: 5 },
  hrnek: { unit: "ml", factor: 250 }, hrnku: { unit: "ml", factor: 250 }, hrnky: { unit: "ml", factor: 250 },
  spetka: { unit: "g", factor: 1 }, spetky: { unit: "g", factor: 1 },
  hrst: { unit: "g", factor: 30 }, hrsti: { unit: "g", factor: 30 },
  strouzek: { unit: "ks", factor: 1 }, strouzky: { unit: "ks", factor: 1 }, strouzku: { unit: "ks", factor: 1 },
  balicek: { unit: "ks", factor: 1 }, balicky: { unit: "ks", factor: 1 }, sacek: { unit: "ks", factor: 1 },
};

export const toNumber = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = v.trim().replace(",", ".");
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

/** qty + unit -> base unit; household units are estimates; unknown units stay unknown (warning). */
export function convertUnit(qty: number, unit: string | null): { qty: number; unit: "g" | "ml" | "ks"; estimated: boolean } | null {
  const u = normalizeText(unit ?? "").replace(/\.$/, "");
  if (!u) return { qty, unit: "ks", estimated: false };
  if (METRIC[u]) return { qty: qty * METRIC[u].factor, unit: METRIC[u].unit, estimated: false };
  if (HOUSEHOLD[u]) return { qty: qty * HOUSEHOLD[u].factor, unit: HOUSEHOLD[u].unit, estimated: true };
  return null;
}

/** The library ingredient for a name: same key, or one key a word-prefix of the other ("mrkev" ~ "mrkev cerstva"). */
export function matchIngredient(name: string, known: KnownIngredient[]): { match: KnownIngredient | null; exact: boolean } {
  const key = nameKey(name);
  const exact = known.find((k) => k.nameKey === key);
  if (exact) return { match: exact, exact: true };
  const near = known.filter((k) => key.startsWith(k.nameKey + " ") || k.nameKey.startsWith(key + " "));
  return near.length === 1 ? { match: near[0], exact: false } : { match: null, exact: false };
}

export type DraftLine = {
  rawName: string;
  name: string;
  qtyPerAdultPortion: number | null;
  unit: "g" | "ml" | "ks";
  ingredientId: string | null;
  exactMatch: boolean;
  warnings: ("estimated_unit" | "piece_unit" | "no_qty" | "unit_mismatch" | "new_ingredient")[];
  note: string | null;
  // "Vždy v kuchyni" (salt, spices): no amount needed (qty 0 = "dle potřeby").
  pantry: boolean;
  // For a new ingredient counted in pieces of something ("stroužek", "plechovka"): the name to keep.
  altUnitName: string | null;
};

/**
 * The recipe per one standard adult portion (servings unknown -> 10, flagged): quantities in g / ml / ks,
 * matched to library ingredients where the name agrees. A unit that can't be compared with the matched
 * ingredient's unit (g vs ml) keeps the import's unit and warns.
 */
export function normalizeRecipe(raw: RawRecipe, known: KnownIngredient[]) {
  const s = toNumber(raw.servings);
  const servings = s && s > 0 ? Math.round(s) : 10;
  const lines: DraftLine[] = (raw.ingredients ?? [])
    .filter((l) => l?.name?.trim())
    .map((l) => {
      const warnings: DraftLine["warnings"] = [];
      const q = toNumber(l.qty);
      const { match, exact } = matchIngredient(l.name, known);
      const pantry = l.pantry === true || !!match?.pantry;
      const rawUnit = (l.unit ?? "").trim();
      // The library ingredient's own second unit ("stroužek" for garlic) is exact, not an estimate.
      const alt = match?.altUnitName && match.altUnitQty && rawUnit && nameKey(rawUnit).slice(0, 4) === nameKey(match.altUnitName).slice(0, 4) ? { qty: (q ?? 0) * match.altUnitQty, unit: match.unit, estimated: false } : null;
      let conv = q == null ? null : alt ?? convertUnit(q, l.unit);
      let altUnitName: string | null = null;
      // An unknown unit (plechovka, balení…) is counted in pieces of it; a household piece (stroužek) too.
      if (q != null && !conv) {
        conv = { qty: q, unit: "ks", estimated: false };
        altUnitName = rawUnit;
        warnings.push("piece_unit");
      } else if (conv?.estimated && conv.unit === "ks" && rawUnit) altUnitName = rawUnit;
      if (q == null && !pantry) warnings.push("no_qty");
      else if (conv?.estimated) warnings.push("estimated_unit");
      if (!match) warnings.push("new_ingredient");
      let unit: DraftLine["unit"] = conv?.unit ?? match?.unit ?? "g";
      if (match && conv && match.unit !== conv.unit) warnings.push("unit_mismatch");
      else if (match) unit = match.unit;
      const per = conv ? Math.round((conv.qty / servings) * 1000) / 1000 : pantry ? 0 : null;
      return { rawName: l.name.trim(), name: match?.name ?? l.name.trim(), qtyPerAdultPortion: per, unit, ingredientId: match?.id ?? null, exactMatch: exact, warnings, note: l.note?.trim() || null, pantry, altUnitName: match ? null : altUnitName };
    });
  const steps = Array.isArray(raw.steps) ? raw.steps.filter(Boolean).join("\n") : raw.steps ?? null;
  const minutes = (v: unknown) => {
    const n = toNumber(typeof v === "number" || typeof v === "string" ? v : null);
    return n != null && n >= 0 && n < 10000 ? Math.round(n) : null;
  };
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  // Suggested variants by ingredient names: "from" must be a line of this recipe; "to" a library or new ingredient.
  const variants = (Array.isArray(raw.variants) ? (raw.variants as RawVariant[]) : [])
    .map((v) => ({
      name: str(v?.name, 100) ?? "",
      swaps: (Array.isArray(v?.swaps) ? (v.swaps as { from?: unknown; to?: unknown }[]) : [])
        .map((sw) => {
          const from = typeof sw?.from === "string" ? nameKey(sw.from) : "";
          const fromLine = lines.findIndex((l) => nameKey(l.rawName) === from || nameKey(l.name) === from);
          const toName = str(sw?.to, 200);
          return fromLine >= 0 && toName ? { fromLine, toName, toIngredientId: matchIngredient(toName, known).match?.id ?? null } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x),
    }))
    .filter((v) => v.name && v.swaps.length);
  return {
    name: (raw.name ?? "").trim(),
    servings,
    servingsGuessed: !(s && s > 0),
    mealType: (raw.mealType ?? raw.meal_type)?.trim() || null,
    steps: steps?.trim() || null,
    prepMinutes: minutes(raw.prep_minutes),
    cookMinutes: minutes(raw.cook_minutes),
    equipment: str(raw.equipment, 500),
    tags: (Array.isArray(raw.tags) ? raw.tags : []).map((t) => str(t, 40)).filter((t): t is string => !!t).slice(0, 10),
    prepAheadOk: raw.prep_ahead_ok === true,
    leftoverFriendly: raw.leftover_friendly === true,
    coldPackable: raw.cold_packable === true,
    variants,
    lines,
  };
}
