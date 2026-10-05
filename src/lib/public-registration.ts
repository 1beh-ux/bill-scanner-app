// The public new-family registration form /r/<slug> (docs/registration-slice3-spec.md D):
// validation of one submission. Pure -- no DB -- so the self-check
// (scripts/test-registration-slice3.ts) and the form itself can use it.
// The server never trusts the client: everything is re-checked here.
import { isIsoDate } from "@/lib/portal-rules";
import { categoryFor, type PriceRules } from "@/lib/price-rules";
import { appliesTo, type FieldAudience } from "@/lib/registration-fields";

export const MAX_PERSONS = 10;
export const SUBMIT_LIMIT_PER_HOUR = 5;
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/;

// audience (slice 5 #1): a field only for children / adults is neither shown to nor accepted from the others.
export type FormField = { key: string; label: string; fieldType: string; options: unknown; required: boolean; audience?: FieldAudience };
export type GuardianIn = { name: string | null; email: string; phone: string | null; relationship: string | null };
export type PersonIn = {
  firstName: string;
  lastName: string;
  birthDate: string;
  isAdult: boolean;
  values: Record<string, string>;
  category: string | null;
  // The person's own contact (adults), from the form.
  email: string | null;
  phone: string | null;
};
export type CleanSubmission = {
  persons: (PersonIn & { guardians: GuardianIn[] })[];
  note: string;
};

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 200;
const selectOptions = (options: unknown) => (Array.isArray(options) ? options.filter((o): o is string => typeof o === "string") : []);

/** The honeypot ("website") was filled = a bot; the route answers OK and stores nothing. */
export const isSpam = (body: unknown) => !!body && typeof body === "object" && str((body as Record<string, unknown>).website) !== "";

/**
 * One submission -> clean persons (with their guardians resolved) or error
 * codes ("persons", "p<i>.<what>", "guardians", "g<i>.email"). Children get the
 * family guardians: the adults ticked as guardian + the extra guardians, each
 * e-mail once; an adult's guardian row is their own contact.
 */
export function validateSubmission(
  body: unknown,
  ctx: { fields: FormField[]; rules: PriceRules | null; oddil: { key: string; options: string[] } | null; today: Date }
): { ok: true; data: CleanSubmission } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const rawPersons = Array.isArray(o.persons) ? o.persons : [];
  if (rawPersons.length < 1 || rawPersons.length > MAX_PERSONS) return { ok: false, errors: ["persons"] };
  const fieldsByKey = new Map(ctx.fields.map((f) => [f.key, f]));
  const todayIso = ctx.today.toISOString().slice(0, 10);

  const persons: PersonIn[] = [];
  const adultGuardians: GuardianIn[] = [];
  rawPersons.forEach((raw, i) => {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const p: PersonIn = {
      firstName: str(r.firstName, 100),
      lastName: str(r.lastName, 100),
      birthDate: str(r.birthDate, 10),
      isAdult: r.isAdult === true,
      values: {},
      category: null,
      email: str(r.email) || null,
      phone: str(r.phone, 50) || null,
    };
    if (!p.firstName) errors.push(`p${i}.firstName`);
    if (!p.lastName) errors.push(`p${i}.lastName`);
    if (!isIsoDate(p.birthDate) || p.birthDate > todayIso || p.birthDate < "1900-01-01") errors.push(`p${i}.birthDate`);
    if (p.isAdult && !(p.email && isEmail(p.email))) errors.push(`p${i}.email`);

    const values = (r.values && typeof r.values === "object" ? r.values : {}) as Record<string, unknown>;
    for (const [key, v] of Object.entries(values)) {
      const f = fieldsByKey.get(key);
      const value = str(v, 2000);
      if (!f || !value || !appliesTo(f.audience, p.isAdult)) continue;
      if (f.fieldType === "select" && selectOptions(f.options).length && !selectOptions(f.options).includes(value)) {
        errors.push(`p${i}.${key}`);
        continue;
      }
      if (f.fieldType === "date" && !isIsoDate(value)) {
        errors.push(`p${i}.${key}`);
        continue;
      }
      p.values[key] = f.fieldType === "boolean" ? (value === "true" ? "true" : "false") : value;
    }
    for (const f of ctx.fields) if (f.required && appliesTo(f.audience, p.isAdult) && !p.values[f.key]) errors.push(`p${i}.${f.key}`);

    if (ctx.rules) {
      const cat = categoryFor(ctx.rules, str(r.category, 40) || null, p.isAdult);
      if (!cat) errors.push(`p${i}.category`);
      else {
        p.category = cat.key;
        if (cat.asksOddil && ctx.oddil) {
          const oddil = str(r.oddil, 200);
          if (!ctx.oddil.options.includes(oddil)) errors.push(`p${i}.oddil`);
          else p.values[ctx.oddil.key] = oddil;
        }
      }
    }
    if (p.isAdult && r.guardianOfChildren === true && p.email) {
      adultGuardians.push({ name: `${p.firstName} ${p.lastName}`.trim(), email: p.email, phone: p.phone, relationship: null });
    }
    persons.push(p);
  });

  const extra: GuardianIn[] = [];
  (Array.isArray(o.guardians) ? o.guardians.slice(0, 10) : []).forEach((raw, i) => {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const g = { name: str(r.name) || null, email: str(r.email), phone: str(r.phone, 50) || null, relationship: str(r.relationship, 100) || null };
    if (!g.email && !g.name && !g.phone) return; // an empty row the parent didn't fill
    if (!isEmail(g.email)) errors.push(`g${i}.email`);
    else extra.push(g);
  });
  const childGuardians: GuardianIn[] = [];
  for (const g of [...adultGuardians, ...extra]) if (!childGuardians.some((x) => x.email.toLowerCase() === g.email.toLowerCase())) childGuardians.push(g);
  if (persons.some((p) => !p.isAdult) && childGuardians.length === 0) errors.push("guardians");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      persons: persons.map((p) => ({
        ...p,
        guardians: p.isAdult ? [{ name: `${p.firstName} ${p.lastName}`.trim(), email: p.email!, phone: p.phone, relationship: null }] : childGuardians,
      })),
      note: str(o.note, 2000),
    },
  };
}
