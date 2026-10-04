// Generic per-event price rules (docs/registration-slice3-spec.md C). Pure --
// no DB, no Node-only imports: document-variables.ts, the event settings
// editor, the portal / public form price preview and the self-check
// (scripts/test-registration-slice3.ts) all use it.
//
// Event.priceRules null = today's pricing exactly (memberPriceCzk /
// nonMemberPriceCzk by isMember). When set, a participant's price is its
// category's: member price when the person is a member and the category has
// one, else the base price; the school-year price for registrations from
// the school-year date on; minus the household discount when enough people
// of the same Family are registered in the event (never on a school-year price).

export type PriceCategory = {
  key: string;
  label: string;
  forAdults: boolean;
  forChildren: boolean;
  priceCzk: number;
  memberPriceCzk?: number;
  schoolYearPriceCzk?: number;
  householdDiscountCzk?: number;
  // The registration form asks the event's "Oddíl" field (oddilFieldKey) for this category.
  asksOddil?: boolean;
};

export type PriceRules = {
  categories: PriceCategory[];
  // MM-DD; the school-year price applies from the first such date after the event start.
  schoolYearFrom: string;
  householdMinMembers: number;
  // Key of a select participant field ("Oddíl") asked for categories with asksOddil.
  oddilFieldKey?: string;
};

export const DEFAULT_SCHOOL_YEAR_FROM = "09-01";
export const DEFAULT_HOUSEHOLD_MIN = 2;

/** "Členství (výchozí)" -- the 2026/2027 membership as decided by the product owner. */
export const MEMBERSHIP_PRESET: PriceRules = {
  categories: [
    { key: "oddil", label: "Dítě registrované na oddíl", forAdults: false, forChildren: true, priceCzk: 1300, schoolYearPriceCzk: 650, householdDiscountCzk: 200, asksOddil: true },
    { key: "ostatni", label: "Ostatní členové (dospělí, děti mimo oddíl)", forAdults: true, forChildren: true, priceCzk: 500, householdDiscountCzk: 100 },
  ],
  schoolYearFrom: DEFAULT_SCHOOL_YEAR_FROM,
  householdMinMembers: DEFAULT_HOUSEHOLD_MIN,
};

const money = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1_000_000 ? v : undefined);
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/** Stored (untrusted) JSON -> clean rules; null = not set / unusable (= today's pricing). */
export function readPriceRules(raw: unknown): PriceRules | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const categories: PriceCategory[] = [];
  for (const c of Array.isArray(o.categories) ? o.categories.slice(0, 20) : []) {
    if (!c || typeof c !== "object") continue;
    const r = c as Record<string, unknown>;
    const key = text(r.key, 40)?.replace(/[^a-zA-Z0-9_-]/g, "");
    const label = text(r.label, 120);
    const priceCzk = money(r.priceCzk);
    if (!key || !label || priceCzk === undefined || categories.some((x) => x.key === key)) continue;
    const forAdults = r.forAdults === true;
    const forChildren = r.forChildren === true;
    if (!forAdults && !forChildren) continue;
    const cat: PriceCategory = { key, label, forAdults, forChildren, priceCzk };
    if (money(r.memberPriceCzk) !== undefined) cat.memberPriceCzk = money(r.memberPriceCzk);
    if (money(r.schoolYearPriceCzk) !== undefined) cat.schoolYearPriceCzk = money(r.schoolYearPriceCzk);
    if (money(r.householdDiscountCzk)) cat.householdDiscountCzk = money(r.householdDiscountCzk);
    if (r.asksOddil === true) cat.asksOddil = true;
    categories.push(cat);
  }
  if (categories.length === 0) return null;
  const from = typeof o.schoolYearFrom === "string" && /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(o.schoolYearFrom) ? o.schoolYearFrom : DEFAULT_SCHOOL_YEAR_FROM;
  const min = typeof o.householdMinMembers === "number" && Number.isInteger(o.householdMinMembers) && o.householdMinMembers >= 2 && o.householdMinMembers <= 20 ? o.householdMinMembers : DEFAULT_HOUSEHOLD_MIN;
  const rules: PriceRules = { categories, schoolYearFrom: from, householdMinMembers: min };
  const oddil = text(o.oddilFieldKey, 100);
  if (oddil) rules.oddilFieldKey = oddil;
  return rules;
}

/** Categories open to this person (adult / child). */
export const allowedCategories = (rules: PriceRules, isAdult: boolean) => rules.categories.filter((c) => (isAdult ? c.forAdults : c.forChildren));

/** The participant's category: the chosen one when allowed for them, else the first allowed (null = none fits). */
export function categoryFor(rules: PriceRules, key: string | null | undefined, isAdult: boolean): PriceCategory | null {
  const allowed = allowedCategories(rules, isAdult);
  return allowed.find((c) => c.key === key) ?? allowed[0] ?? null;
}

/** The school-year date: the first schoolYearFrom (MM-DD) after the event's start date. */
export function schoolYearStart(rules: PriceRules, eventStart: Date): Date {
  const [mm, dd] = rules.schoolYearFrom.split("-").map(Number);
  const year = eventStart.getUTCFullYear();
  const d = new Date(Date.UTC(year, mm - 1, dd));
  return d > eventStart ? d : new Date(Date.UTC(year + 1, mm - 1, dd));
}

export type PriceInput = {
  category?: string | null;
  isAdult: boolean;
  isMember: boolean;
  // When the registration was made (school-year price from the date on).
  createdAt: Date;
  eventStart: Date;
  // People of the same Family registered (pending or accepted, active) in the event, this one included.
  householdCount: number;
};

/** Price by the rules (null = no category fits this person). */
export function rulePrice(rules: PriceRules, p: PriceInput): number | null {
  const cat = categoryFor(rules, p.category, p.isAdult);
  if (!cat) return null;
  if (cat.schoolYearPriceCzk !== undefined && p.createdAt >= schoolYearStart(rules, p.eventStart)) return cat.schoolYearPriceCzk;
  const base = p.isMember && cat.memberPriceCzk !== undefined ? cat.memberPriceCzk : cat.priceCzk;
  const discount = p.householdCount >= rules.householdMinMembers ? (cat.householdDiscountCzk ?? 0) : 0;
  return Math.max(0, base - discount);
}

/**
 * Prices of new registrations of one household before they exist (portal /
 * public form preview): every pick counts toward the household, together with
 * `alreadyRegistered` members of the same family. Without rules: today's
 * member / non-member price.
 */
export function previewPrices(
  pricing: { rules: PriceRules | null; memberPriceCzk: number | null; nonMemberPriceCzk: number | null; eventStart: Date; alreadyRegistered: number; inFamily: boolean },
  picks: { category?: string | null; isAdult: boolean; isMember: boolean }[],
  now: Date = new Date()
): (number | null)[] {
  return picks.map((p) => {
    if (!pricing.rules) return p.isMember ? pricing.memberPriceCzk : pricing.nonMemberPriceCzk;
    const householdCount = pricing.inFamily ? pricing.alreadyRegistered + picks.length : 1;
    return rulePrice(pricing.rules, { ...p, createdAt: now, eventStart: pricing.eventStart, householdCount });
  });
}
