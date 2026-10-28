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
