// The 14 EU allergens (official numbering) and the diet flags (docs/kitchen-planning-design.md). Pure, client-safe.
// Codes are stored in the DB (Child.allergens, Ingredient.allergens, ParticipantDiet); labels are for display.
// keywords: diacritics-free stems matched in free allergy text (mapAllergyText, Part B).
export type AllergenCode =
  | "gluten" | "crustaceans" | "eggs" | "fish" | "peanuts" | "soy" | "milk"
  | "nuts" | "celery" | "mustard" | "sesame" | "sulphites" | "lupin" | "molluscs";

export const ALLERGENS: { code: AllergenCode; no: number; cs: string; en: string; keywords: string[] }[] = [
  { code: "gluten", no: 1, cs: "obiloviny obsahující lepek", en: "cereals containing gluten", keywords: ["lepek", "lepku", "psenic", "zito", "jecmen", "ovs", "gluten", "celiak"] },
  { code: "crustaceans", no: 2, cs: "korýši", en: "crustaceans", keywords: ["korys", "krevet", "krab", "humr"] },
  { code: "eggs", no: 3, cs: "vejce", en: "eggs", keywords: ["vejce", "vajic", "vajec"] },
  { code: "fish", no: 4, cs: "ryby", en: "fish", keywords: ["ryb"] },
  { code: "peanuts", no: 5, cs: "arašídy", en: "peanuts", keywords: ["arasid", "burak"] },
  { code: "soy", no: 6, cs: "sójové boby", en: "soybeans", keywords: ["soja", "soj"] },
  { code: "milk", no: 7, cs: "mléko", en: "milk", keywords: ["mleko", "mlek", "mlecn", "laktoz", "laktos"] },
  { code: "nuts", no: 8, cs: "skořápkové plody", en: "tree nuts", keywords: ["orech", "liskov", "vlassk", "mandl", "kesu", "pistac", "pekan", "makadam"] },
  { code: "celery", no: 9, cs: "celer", en: "celery", keywords: ["celer"] },
  { code: "mustard", no: 10, cs: "hořčice", en: "mustard", keywords: ["horcic"] },
  { code: "sesame", no: 11, cs: "sezamová semena", en: "sesame seeds", keywords: ["sezam"] },
  { code: "sulphites", no: 12, cs: "oxid siřičitý a siřičitany", en: "sulphur dioxide and sulphites", keywords: ["siric", "sulfit"] },
  { code: "lupin", no: 13, cs: "vlčí bob", en: "lupin", keywords: ["vlci bob", "lupin"] },
  { code: "molluscs", no: 14, cs: "měkkýši", en: "molluscs", keywords: ["mekkys", "musl", "slavk", "chobotnic", "olihen"] },
];
export const ALLERGEN_CODES = ALLERGENS.map((a) => a.code) as string[];

/** What a person may not eat (beyond allergens). */
export type DietFlag = "vegetarian" | "vegan" | "no_pork";
export const DIET_FLAGS: { code: DietFlag; cs: string; en: string; keywords: string[] }[] = [
  { code: "vegetarian", cs: "vegetarián", en: "vegetarian", keywords: ["vegetarian", "bezmas", "bez masa"] },
  { code: "vegan", cs: "vegan", en: "vegan", keywords: ["vegan"] },
  { code: "no_pork", cs: "bez vepřového", en: "no pork", keywords: ["veprov", "bez vepr"] },
];
export const DIET_FLAG_CODES = DIET_FLAGS.map((d) => d.code) as string[];

/** What an ingredient contains (for the diet conflicts, Part B). */
export const CONTENT_FLAGS = ["meat", "pork", "fish", "dairy", "egg"] as const;

/** Untrusted codes -> the known ones, each once, in the official order. */
export const cleanCodes = (raw: unknown, known: string[]): string[] =>
  Array.isArray(raw) ? known.filter((k) => raw.includes(k)) : [];

// ===== Free text -> codes (Strava účastníků, Part B5) =====

/** Lower-case, no diacritics, single spaces -- for matching only. */
export const normalizeText = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// Words that start like an allergen stem but aren't one (rybíz is no fish, müsli no mollusc).
const FALSE_STEMS = ["rybiz", "musli", "ovoce", "ovocn"];
// A token with these keeps its raw text in `unmapped` (a human must read it): negations and severity.
const NEGATIONS = ["nema", "neni", "zadn", "nic ", "netrpi"];
const SEVERITY = ["anafylax", "tezk", "zivot", "epipen", "adrenalin"];

const hasStem = (token: string, stem: string) =>
  stem.includes(" ") ? new RegExp(`(^|\\s)${stem}`).test(token) : token.split(/[^a-z0-9]+/).some((w) => w.startsWith(stem) && !FALSE_STEMS.some((f) => w.startsWith(f)));

/**
 * An allergy / diet text -> the allergen codes and diet flags it names + every token it couldn't (fully) read.
 * Split on commas, semicolons, " a ", newlines. Nothing is ever dropped: an unmatched token, a negation
 * ("nemá alergii") or a severity word ("anafylaxe") lands in `unmapped` for a human to check.
 */
export function mapAllergyText(text: string): { allergens: string[]; dietFlags: string[]; unmapped: string[] } {
  const allergens = new Set<string>();
  const diets = new Set<string>();
  const unmapped: string[] = [];
  for (const raw of text.split(/[,;\n]|\s+a\s+/i)) {
    const token = normalizeText(raw);
    if (!token || token === "-") continue;
    let matched = false;
    for (const a of ALLERGENS) if (a.keywords.some((k) => hasStem(token, k))) { allergens.add(a.code); matched = true; }
    for (const d of DIET_FLAGS) if (d.keywords.some((k) => hasStem(token, k))) { diets.add(d.code); matched = true; }
    // vegan implies vegetarian's conflicts already (vegan is the stricter flag).
    const unsure = NEGATIONS.some((n) => `${token} `.includes(n)) || SEVERITY.some((s) => token.includes(s));
    if (!matched || unsure) unmapped.push(raw.trim());
  }
  return { allergens: ALLERGEN_CODES.filter((c) => allergens.has(c)), dietFlags: DIET_FLAG_CODES.filter((c) => diets.has(c)), unmapped };
}

// ===== Conflicts of a plan entry (Part B5) =====

// What each diet may not eat (ingredient content flags).
export const DIET_CONFLICTS: Record<DietFlag, string[]> = {
  vegetarian: ["meat", "fish"],
  vegan: ["meat", "fish", "dairy", "egg"],
  no_pork: ["pork"],
};

export type IngredientInfo = { id: string; name: string; allergens: string[]; dietFlags: string[]; allergensConfirmed: boolean };
export type MealLine = { ingredientId: string; qty: number; optional?: boolean };
export type Swap = { fromIngredientId: string; toIngredientId: string; qtyPerAdultPortion?: number | null };
export type VariantInfo = { id: string; name: string; clearsAllergens: string[]; swaps: Swap[] };
// confirmed: the person's restrictions are confirmed (adults always; a participant once Strava účastníků confirms it);
// unverified = there is allergy text nobody confirmed yet -> unknown, never "no allergy".
export type PersonDiet = { key: string; name: string; allergens: string[]; dietFlags: string[]; status: "confirmed" | "unverified" | "none" };

/** The meal's lines with the variants' swaps applied (a swap without its own quantity keeps the line's). */
export function applyVariants(lines: MealLine[], variants: VariantInfo[]): MealLine[] {
  let out = lines;
  for (const v of variants) {
    out = out.map((l) => {
      const s = v.swaps.find((x) => x.fromIngredientId === l.ingredientId);
      return s ? { ...l, ingredientId: s.toIngredientId, qty: s.qtyPerAdultPortion ?? l.qty } : l;
    });
  }
  return out;
}

/** Allergens + content of the lines (optional lines included: they may land on the plate); unconfirmed ingredients = unknown. */
export function mealProfile(lines: MealLine[], ingredients: Map<string, IngredientInfo>, cleared: string[] = []) {
  const allergens = new Set<string>();
  const content = new Set<string>();
  const unconfirmed: string[] = [];
  for (const l of lines) {
    const i = ingredients.get(l.ingredientId);
    if (!i) continue;
    i.allergens.forEach((a) => allergens.add(a));
    i.dietFlags.forEach((d) => content.add(d));
    if (!i.allergensConfirmed && !unconfirmed.includes(i.name)) unconfirmed.push(i.name);
  }
  cleared.forEach((a) => allergens.delete(a));
  return { allergens, content, unconfirmed };
}

/** What a person can't eat in a profile: allergens they have, diet conflicts. */
export function personConflicts(profile: { allergens: Set<string>; content: Set<string> }, p: PersonDiet) {
  const allergens = p.allergens.filter((a) => profile.allergens.has(a));
  const diets = p.dietFlags.filter((d) => (DIET_CONFLICTS[d as DietFlag] ?? []).some((c) => profile.content.has(c)));
  return { allergens, diets };
}

/**
 * An entry against the people present: who has a conflict with the base dish (the applied variants), which
 * meal variant clears it (special portions, grouped by variant, with names), who no variant clears (red),
 * how many have unconfirmed restrictions and which ingredients' allergens nobody confirmed (amber).
 */
export function entryConflicts(lines: MealLine[], ingredients: Map<string, IngredientInfo>, variants: VariantInfo[], appliedVariantIds: string[], people: PersonDiet[]) {
  const applied = variants.filter((v) => appliedVariantIds.includes(v.id));
  const baseLines = applyVariants(lines, applied);
  const base = mealProfile(baseLines, ingredients, applied.flatMap((v) => v.clearsAllergens));
  const conflicts: { key: string; name: string; allergens: string[]; diets: string[]; variantId: string | null }[] = [];
  const special = new Map<string, { variantId: string; variantName: string; applied: boolean; names: string[] }>();
  const noVariant: string[] = [];
  for (const p of people) {
    if (p.status !== "confirmed") continue;
    const c = personConflicts(base, p);
    if (!c.allergens.length && !c.diets.length) continue;
    // The first meal variant that, on top of the applied ones, leaves this person nothing they can't eat.
    const clearing = variants.find((v) => {
      const prof = mealProfile(applyVariants(baseLines, [v]), ingredients, [...applied.flatMap((x) => x.clearsAllergens), ...v.clearsAllergens]);
      const left = personConflicts(prof, p);
      return !left.allergens.length && !left.diets.length;
    });
    conflicts.push({ key: p.key, name: p.name, ...c, variantId: clearing?.id ?? null });
    if (!clearing) noVariant.push(p.name);
    else {
      const g = special.get(clearing.id) ?? { variantId: clearing.id, variantName: clearing.name, applied: appliedVariantIds.includes(clearing.id), names: [] };
      g.names.push(p.name);
      special.set(clearing.id, g);
    }
  }
  const unverifiedPeople = people.filter((p) => p.status === "unverified").length;
  return {
    allergens: ALLERGEN_CODES.filter((a) => base.allergens.has(a)),
    unconfirmedIngredients: base.unconfirmed,
    conflicts,
    specialPortions: [...special.values()],
    noVariant,
    unverifiedPeople,
    // red: someone no variant can feed; amber: something nobody confirmed; else ok.
    level: noVariant.length ? ("red" as const) : unverifiedPeople || base.unconfirmed.length ? ("amber" as const) : ("ok" as const),
  };
}
