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
  // Laktóza is an intolerance, not the milk allergy: it maps to the "bez laktózy" diet.
  { code: "milk", no: 7, cs: "mléko", en: "milk", keywords: ["mleko", "mlek", "mlecn"] },
  { code: "nuts", no: 8, cs: "skořápkové plody", en: "tree nuts", keywords: ["orech", "liskov", "vlassk", "mandl", "kesu", "pistac", "pekan", "makadam"] },
  { code: "celery", no: 9, cs: "celer", en: "celery", keywords: ["celer"] },
  { code: "mustard", no: 10, cs: "hořčice", en: "mustard", keywords: ["horcic"] },
  { code: "sesame", no: 11, cs: "sezamová semena", en: "sesame seeds", keywords: ["sezam"] },
  { code: "sulphites", no: 12, cs: "oxid siřičitý a siřičitany", en: "sulphur dioxide and sulphites", keywords: ["siric", "sulfit"] },
  { code: "lupin", no: 13, cs: "vlčí bob", en: "lupin", keywords: ["vlci bob", "lupin"] },
  { code: "molluscs", no: 14, cs: "měkkýši", en: "molluscs", keywords: ["mekkys", "musl", "slavk", "chobotnic", "olihen"] },
];
export const ALLERGEN_CODES = ALLERGENS.map((a) => a.code) as string[];

/**
 * Diets: what a person may not eat beyond allergens. The organization's own list (Šablony -> Kuchyně, ListTemplate
 * kitchen_diet); these are the defaults it starts with. A diet is broken by an ingredient that contains one of
 * `contents` (an ingredient's content flags) or one of `allergens` -- unless the ingredient is marked fine for
 * it ("ok:<code>" in its flags, e.g. lactose-free milk for "bez laktózy").
 */
export type DietDef = { code: string; name: string; keywords: string[]; contents: string[]; allergens: string[] };
export const DEFAULT_DIETS: DietDef[] = [
  { code: "vegetarian", name: "vegetarián", keywords: ["vegetarian", "bezmas", "bez masa"], contents: ["meat", "fish"], allergens: [] },
  { code: "vegan", name: "vegan", keywords: ["vegan"], contents: ["meat", "fish", "dairy", "egg"], allergens: [] },
  { code: "no_pork", name: "bez vepřového", keywords: ["veprov", "bez vepr"], contents: ["pork"], allergens: [] },
  { code: "gluten_free", name: "bezlepková", keywords: ["bezlepk", "bez lepku"], contents: [], allergens: ["gluten"] },
  { code: "lactose_free", name: "bez laktózy", keywords: ["laktoz", "laktos", "bezlaktoz"], contents: [], allergens: ["milk"] },
];

/** What an ingredient contains (for the diet conflicts). */
export const CONTENT_FLAGS = ["meat", "pork", "fish", "dairy", "egg"] as const;
/** An ingredient's flags: its content flags + "ok:<diet code>" markers. */
export const cleanIngredientFlags = (raw: unknown): string[] =>
  Array.isArray(raw) ? [...new Set(raw.filter((x): x is string => typeof x === "string" && ((CONTENT_FLAGS as readonly string[]).includes(x) || /^ok:[a-z0-9_]{1,40}$/.test(x))))] : [];
/** A diet code from a name: "Bez ořechů" -> "bez_orechu". */
export const dietCode = (name: string) => normalizeText(name).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "dieta";

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
export function mapAllergyText(text: string, dietDefs: DietDef[] = DEFAULT_DIETS): { allergens: string[]; dietFlags: string[]; unmapped: string[] } {
  const allergens = new Set<string>();
  const diets = new Set<string>();
  const unmapped: string[] = [];
  for (const raw of text.split(/[,;\n]|\s+a\s+/i)) {
    const token = normalizeText(raw);
    if (!token || token === "-") continue;
    let matched = false;
    for (const a of ALLERGENS) if (a.keywords.some((k) => hasStem(token, k))) { allergens.add(a.code); matched = true; }
    for (const d of dietDefs) if (d.keywords.some((k) => k && hasStem(token, normalizeText(k)))) { diets.add(d.code); matched = true; }
    // vegan implies vegetarian's conflicts already (vegan is the stricter flag).
    const unsure = NEGATIONS.some((n) => `${token} `.includes(n)) || SEVERITY.some((s) => token.includes(s));
    if (!matched || unsure) unmapped.push(raw.trim());
  }
  return { allergens: ALLERGEN_CODES.filter((c) => allergens.has(c)), dietFlags: dietDefs.map((d) => d.code).filter((c) => diets.has(c)), unmapped };
}

// ===== Conflicts of a plan entry (Part B5) =====


export type IngredientInfo = { id: string; name: string; allergens: string[]; dietFlags: string[]; allergensConfirmed: boolean };
export type MealLine = { ingredientId: string; qty: number; optional?: boolean };
export type Swap = { fromIngredientId: string; toIngredientId: string; qtyPerAdultPortion?: number | null };
export type VariantInfo = { id: string; name: string; clearsAllergens: string[]; swaps: Swap[] };
// confirmed: the person's restrictions are confirmed (adults always; a participant once Strava účastníků confirms it);
// unverified = there is allergy text nobody confirmed yet -> unknown, never "no allergy".
// rawText / unmapped (audit 2026-11-05): the parent's own words and those no allergen / diet matched, shown next to
// the chips wherever a diet is shown, so "anafylaxe" is never hidden behind "no allergens".
/** Confirming a diet whose text has unmatched words needs a note or the explicit "posoudil/a" tick. */
export const reviewMissing = (unmapped: string[], note: string | null | undefined, ticked: boolean) => unmapped.length > 0 && !note?.trim() && !ticked;

export type PersonDiet = { key: string; name: string; allergens: string[]; dietFlags: string[]; status: "confirmed" | "unverified" | "none"; rawText?: string; unmapped?: string[] };

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

/**
 * Allergens + content of the lines (optional lines included: they may land on the plate), the diets the lines
 * break (dietBlocked); unconfirmed ingredients = unknown.
 */
export function mealProfile(lines: MealLine[], ingredients: Map<string, IngredientInfo>, cleared: string[] = [], dietDefs: DietDef[] = DEFAULT_DIETS) {
  const allergens = new Set<string>();
  const content = new Set<string>();
  const dietBlocked = new Set<string>();
  const unconfirmed: string[] = [];
  for (const l of lines) {
    const i = ingredients.get(l.ingredientId);
    if (!i) continue;
    const own = i.allergens.filter((a) => !cleared.includes(a));
    own.forEach((a) => allergens.add(a));
    i.dietFlags.forEach((d) => content.add(d));
    for (const d of dietDefs)
      if (!i.dietFlags.includes(`ok:${d.code}`) && (d.contents.some((c) => i.dietFlags.includes(c)) || d.allergens.some((a) => own.includes(a)))) dietBlocked.add(d.code);
    if (!i.allergensConfirmed && !unconfirmed.includes(i.name)) unconfirmed.push(i.name);
  }
  return { allergens, content, dietBlocked, unconfirmed };
}

/** What a person can't eat in a profile: allergens they have, diet conflicts. */
export function personConflicts(profile: { allergens: Set<string>; dietBlocked: Set<string> }, p: PersonDiet) {
  const allergens = p.allergens.filter((a) => profile.allergens.has(a));
  const diets = p.dietFlags.filter((d) => profile.dietBlocked.has(d));
  return { allergens, diets };
}

/**
 * An entry against the people present. The base dish is cooked for everyone; an applied variant
 * (entry.variantIds) is cooked as special portions for the people it clears. Per person with a conflict:
 * the variant that clears it (an applied one first), grouped into special portions with names.
 * red: someone is left without a safe plate (no variant clears them, or that variant isn't applied yet);
 * amber: restrictions or ingredient allergens nobody confirmed; else ok.
 */
export function entryConflicts(lines: MealLine[], ingredients: Map<string, IngredientInfo>, variants: VariantInfo[], appliedVariantIds: string[], people: PersonDiet[], dietDefs: DietDef[] = DEFAULT_DIETS) {
  const base = mealProfile(lines, ingredients, [], dietDefs);
  // The applied variants' swapped-in ingredients count for "neověřeno" too.
  for (const v of variants.filter((x) => appliedVariantIds.includes(x.id)))
    for (const n of mealProfile(applyVariants(lines, [v]), ingredients).unconfirmed) if (!base.unconfirmed.includes(n)) base.unconfirmed.push(n);
  const conflicts: { key: string; name: string; allergens: string[]; diets: string[]; variantId: string | null; rawText?: string; unmapped?: string[] }[] = [];
  const special = new Map<string, { variantId: string; variantName: string; applied: boolean; names: string[] }>();
  const noVariant: string[] = [];
  for (const p of people) {
    if (p.status !== "confirmed") continue;
    const c = personConflicts(base, p);
    if (!c.allergens.length && !c.diets.length) continue;
    // The meal variant that leaves this person nothing they can't eat (applied ones first).
    const ordered = [...variants.filter((v) => appliedVariantIds.includes(v.id)), ...variants.filter((v) => !appliedVariantIds.includes(v.id))];
    const clearing = ordered.find((v) => {
      const left = personConflicts(mealProfile(applyVariants(lines, [v]), ingredients, v.clearsAllergens, dietDefs), p);
      return !left.allergens.length && !left.diets.length;
    });
    conflicts.push({ key: p.key, name: p.name, ...c, variantId: clearing?.id ?? null, rawText: p.rawText, unmapped: p.unmapped });
    if (!clearing) noVariant.push(p.name);
    else {
      const g = special.get(clearing.id) ?? { variantId: clearing.id, variantName: clearing.name, applied: appliedVariantIds.includes(clearing.id), names: [] };
      g.names.push(p.name);
      special.set(clearing.id, g);
    }
  }
  const unverifiedPeople = people.filter((p) => p.status === "unverified").length;
  const uncovered = conflicts.filter((c) => !c.variantId || !appliedVariantIds.includes(c.variantId)).map((c) => c.name);
  return {
    allergens: ALLERGEN_CODES.filter((a) => base.allergens.has(a)),
    unconfirmedIngredients: base.unconfirmed,
    conflicts,
    specialPortions: [...special.values()],
    noVariant,
    uncovered,
    unverifiedPeople,
    level: uncovered.length ? ("red" as const) : unverifiedPeople || base.unconfirmed.length ? ("amber" as const) : ("ok" as const),
  };
}
