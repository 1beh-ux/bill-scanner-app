"use client";

import { useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";
import FieldInput, { portalInputClass as inputClass } from "@/components/registration/FieldInput";
import PersonPrice from "@/components/registration/PersonPrice";
import { allowedCategories, previewPrices, type PriceRules } from "@/lib/price-rules";
import { MAX_PERSONS, type FormField } from "@/lib/public-registration";
import { appliesTo } from "@/lib/registration-fields";

// The public new-family form (docs/registration-slice3-spec.md D): 1+ adults
// and/or children, each with the org fields the portal shows (required ones
// marked), "same details as the first person", guardians for the children
// (adults ticked as guardian + extra ones), a price category per person and
// the live price incl. the household discount. Validated again on the server.
type Person = {
  isAdult: boolean;
  firstName: string;
  lastName: string;
  birthDate: string;
  email: string;
  phone: string;
  guardianOfChildren: boolean;
  sameAsFirst: boolean;
  values: Record<string, string>;
  category?: string;
  oddil?: string;
};
type Guardian = { name: string; email: string; phone: string; relationship: string };
type EventInfo = {
  name: string;
  kind: "event" | "membership";
  membershipYear: number | null;
  startDate: string;
  endDate: string;
  registrationDeadline: string | null;
  landingContent: string | null;
  memberPriceCzk: number | null;
  nonMemberPriceCzk: number | null;
};

const btnPrimary = "rounded-lg bg-ember px-4 py-2.5 text-[15px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const btn = "rounded-lg border border-mist px-3 py-2 text-[14px] text-ink hover:bg-paper-2 disabled:opacity-50";
const card = "rounded-lg border border-mist bg-paper p-4";
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("cs-CZ", { timeZone: "UTC" }) : "—");
const newPerson = (isAdult: boolean, sameAsFirst: boolean): Person => ({
  isAdult,
  firstName: "",
  lastName: "",
  birthDate: "",
  email: "",
  phone: "",
  guardianOfChildren: isAdult,
  sameAsFirst,
  values: {},
});

export default function PublicForm({
  slug,
  event,
  fields,
  rules,
  oddil,
  strings,
}: {
  slug: string;
  event: EventInfo;
  fields: FormField[];
  rules: PriceRules | null;
  oddil: { key: string; label: string; options: string[] } | null;
  strings: Record<string, string>;
}) {
  const t = useCallback(
    (key: string, vars?: Record<string, string>) => {
      let s = strings[key] ?? key;
      for (const [k, v] of Object.entries(vars ?? {})) s = s.replace(`{${k}}`, v);
      return s;
    },
    [strings]
  );
  const [persons, setPersons] = useState<Person[]>([newPerson(true, false), newPerson(false, false)]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [done, setDone] = useState(false);
  // The family's portal link -- only when the event auto-sends (slice 4 #10).
  const [portalLink, setPortalLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const title = event.kind === "membership" ? t("portal.membership", { year: String(event.membershipYear ?? "") }) : event.name;
  const setPerson = (i: number, patch: Partial<Person>) => setPersons((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const categoriesOf = (p: Person) => (rules ? allowedCategories(rules, p.isAdult).map((c) => ({ key: c.key, label: c.label, asksOddil: !!c.asksOddil })) : []);
  // Only the fields for this person (slice 5 #1: children / adults / both).
  const fieldsOf = (p: Person) => fields.filter((f) => appliesTo(f.audience, p.isAdult));
  // "Same details as the first person": the first person's values of the fields
  // both have are sent for this one; the rest (e.g. children-only) stay asked.
  const shared = (p: Person, f: FormField) => p.sameAsFirst && !!persons[0] && appliesTo(f.audience, persons[0].isAdult);
  const valuesOf = (p: Person) =>
    p.sameAsFirst && persons[0] ? { ...p.values, ...Object.fromEntries(fieldsOf(p).filter((f) => shared(p, f) && persons[0].values[f.key]).map((f) => [f.key, persons[0].values[f.key]])) } : p.values;
  const prices = previewPrices(
    { rules, memberPriceCzk: event.memberPriceCzk, nonMemberPriceCzk: event.nonMemberPriceCzk, eventStart: new Date(event.startDate), alreadyRegistered: 0, inFamily: true },
    persons.map((p) => ({ category: p.category ?? categoriesOf(p)[0]?.key, isAdult: p.isAdult, isMember: false }))
  );
  const total = prices.reduce<number>((s, p) => s + (p ?? 0), 0);
  const hasChildren = persons.some((p) => !p.isAdult);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors(null);
    const body = {
      website,
      note,
      guardians,
      persons: persons.map((p) => ({ ...p, values: valuesOf(p), category: p.category ?? categoriesOf(p)[0]?.key })),
    };
    const res = await fetch(`/api/public/r/${slug}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setPortalLink((await res.json().catch(() => ({}))).portalLink ?? null);
      return setDone(true);
    }
    const d = res ? await res.json().catch(() => ({})) : {};
    setErrors(res?.status === 429 ? [t("public.throttled")] : Array.isArray(d.fields) ? d.fields.map(describe) : [t("public.failed")]);
  }

  // "p1.firstName" -> "Osoba 2: Jméno"
  function describe(code: string): string {
    const m = /^([pg])(\d+)\.(.+)$/.exec(code);
    if (!m) return t(`public.err.${code}`);
    const what = fields.find((f) => f.key === m[3])?.label ?? (m[3] === oddil?.key ? oddil.label : t(`public.err.${m[3]}`));
    return `${t(m[1] === "p" ? "public.personN" : "public.guardianN", { n: String(Number(m[2]) + 1) })}: ${what}`;
  }

  if (done) {
    return (
      <div className="mx-auto w-full max-w-2xl p-4 pb-16">
        <p className="text-[12px] uppercase tracking-wide text-ink-secondary">{t("public.title")}</p>
        <h1 className="mb-4 mt-1 text-[24px] font-semibold text-ink">{title}</h1>
        <div className={card + " flex flex-col gap-2"}>
          <p className="text-[16px] font-semibold text-ink">{t("public.doneTitle")}</p>
          {portalLink ? (
            <>
              <p className="text-[14px] text-ink">{t("public.doneLinkHint")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 rounded bg-paper-2 px-2 py-1.5 text-[13px] text-ink [overflow-wrap:anywhere]">{portalLink}</code>
                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(portalLink)
                      .then(() => setCopied(true))
                      .catch(() => {})
                  }
                  className={btn}
                >
                  {t(copied ? "public.copied" : "public.copyLink")}
                </button>
              </div>
              <p className="text-[13px] text-ink-secondary">{t("public.doneLinkGate")}</p>
            </>
          ) : (
            <p className="text-[14px] text-ink-secondary">{t("public.doneHint")}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-4 pb-16">
      <p className="text-[12px] uppercase tracking-wide text-ink-secondary">{t("public.title")}</p>
      <h1 className="mt-1 text-[24px] font-semibold text-ink">{title}</h1>
      <p className="mb-4 text-[13px] text-ink-secondary">
        {date(event.startDate)} – {date(event.endDate)}
        {event.registrationDeadline && ` · ${t("portal.deadline", { date: date(event.registrationDeadline) })}`}
      </p>
      {event.landingContent && (
        <div className={card + " mb-6 text-[15px] leading-relaxed text-ink [&_a]:text-ember [&_a]:underline [&_h2]:mt-3 [&_h2]:text-[18px] [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:my-2"}>
          <ReactMarkdown>{event.landingContent}</ReactMarkdown>
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-4">
        <h2 className="text-[18px] font-semibold text-ink">{t("public.formTitle")}</h2>
        <p className="text-[13px] text-ink-secondary">{t("public.formHint")}</p>
        {/* Honeypot: invisible to people, bots fill it in. */}
        <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />

        {persons.map((p, i) => (
          <section key={i} className={card + " flex flex-col gap-3"}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[16px] font-semibold text-ink">
                {t("public.personN", { n: String(i + 1) })} · {t(p.isAdult ? "public.adult" : "public.child")}
              </h3>
              {persons.length > 1 && (
                <button type="button" onClick={() => setPersons((x) => x.filter((_, j) => j !== i))} className="text-[14px] text-red-600">
                  {t("portal.remove")}
                </button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-[13px] text-ink-secondary">
                {t("public.firstName")} *
                <input required value={p.firstName} onChange={(e) => setPerson(i, { firstName: e.target.value })} className={inputClass + " mt-1"} />
              </label>
              <label className="text-[13px] text-ink-secondary">
                {t("public.lastName")} *
                <input required value={p.lastName} onChange={(e) => setPerson(i, { lastName: e.target.value })} className={inputClass + " mt-1"} />
              </label>
              <label className="text-[13px] text-ink-secondary">
                {t("portal.reviewBirth")} *
                <input required type="date" value={p.birthDate} onChange={(e) => setPerson(i, { birthDate: e.target.value })} className={inputClass + " mt-1"} />
              </label>
              {p.isAdult && (
                <>
                  <label className="text-[13px] text-ink-secondary">
                    {t("portal.guardianEmail")} *
                    <input required type="email" value={p.email} onChange={(e) => setPerson(i, { email: e.target.value })} className={inputClass + " mt-1"} />
                  </label>
                  <label className="text-[13px] text-ink-secondary">
                    {t("portal.guardianPhone")}
                    <input type="tel" value={p.phone} onChange={(e) => setPerson(i, { phone: e.target.value })} className={inputClass + " mt-1"} />
                  </label>
                  <label className="flex items-center gap-2 self-end text-[14px] text-ink">
                    <input type="checkbox" checked={p.guardianOfChildren} onChange={(e) => setPerson(i, { guardianOfChildren: e.target.checked })} />
                    {t("public.isGuardian")}
                  </label>
                </>
              )}
            </div>
            {fieldsOf(p).length > 0 && i > 0 && (
              <label className="flex items-center gap-2 text-[14px] text-ink">
                <input type="checkbox" checked={p.sameAsFirst} onChange={(e) => setPerson(i, { sameAsFirst: e.target.checked })} />
                {t("public.sameAsFirst")}
              </label>
            )}
            {fieldsOf(p).some((f) => !(i > 0 && shared(p, f))) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {fieldsOf(p).filter((f) => !(i > 0 && shared(p, f))).map((f) => (
                  <label key={f.key} className="flex flex-col gap-1 text-[13px] text-ink-secondary">
                    <span>
                      {f.label}
                      {f.required && " *"}
                    </span>
                    <FieldInput field={f} value={p.values[f.key] ?? ""} required={f.required && f.fieldType !== "boolean"} onChange={(v) => setPerson(i, { values: { ...p.values, [f.key]: v } })} yesLabel={t("portal.yes")} />
                  </label>
                ))}
              </div>
            )}
            <PersonPrice
              categories={categoriesOf(p)}
              category={p.category}
              onCategory={(category) => setPerson(i, { category })}
              oddil={oddil}
              oddilValue={p.oddil}
              onOddil={(v) => setPerson(i, { oddil: v })}
              price={prices[i]}
              t={t}
            />
          </section>
        ))}

        {persons.length < MAX_PERSONS && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setPersons((x) => [...x, newPerson(false, x.length > 0)])} className={btn}>
              + {t("public.addChild")}
            </button>
            <button type="button" onClick={() => setPersons((x) => [...x, newPerson(true, false)])} className={btn}>
              + {t("public.addAdult")}
            </button>
          </div>
        )}

        {hasChildren && (
          <section className={card + " flex flex-col gap-3"}>
            <h3 className="text-[16px] font-semibold text-ink">{t("portal.guardians")}</h3>
            <p className="text-[13px] text-ink-secondary">{t("public.guardiansHint")}</p>
            {guardians.map((g, i) => {
              const set = (patch: Partial<Guardian>) => setGuardians((x) => x.map((y, j) => (j === i ? { ...y, ...patch } : y)));
              return (
                <div key={i} className="grid gap-2 rounded-lg border border-mist p-3 sm:grid-cols-2">
                  <input placeholder={t("portal.guardianName")} value={g.name} onChange={(e) => set({ name: e.target.value })} className={inputClass} />
                  <input type="email" required placeholder={t("portal.guardianEmail") + " *"} value={g.email} onChange={(e) => set({ email: e.target.value })} className={inputClass} />
                  <input placeholder={t("portal.guardianRelationship")} value={g.relationship} onChange={(e) => set({ relationship: e.target.value })} className={inputClass} />
                  <input type="tel" placeholder={t("portal.guardianPhone")} value={g.phone} onChange={(e) => set({ phone: e.target.value })} className={inputClass} />
                  <button type="button" onClick={() => setGuardians((x) => x.filter((_, j) => j !== i))} className="justify-self-start text-[14px] text-red-600">
                    {t("portal.remove")}
                  </button>
                </div>
              );
            })}
            <div>
              <button type="button" onClick={() => setGuardians((x) => [...x, { name: "", email: "", phone: "", relationship: "" }])} className={btn}>
                {t("portal.addGuardian")}
              </button>
            </div>
          </section>
        )}

        <label className="text-[13px] text-ink-secondary">
          {t("portal.note")}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} className={inputClass + " mt-1"} />
        </label>
        {prices.some((x) => x != null) && <p className="text-[16px] font-semibold text-ink">{t("portal.total", { price: String(total) })}</p>}
        {errors && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-[14px] text-red-700">
            <p className="font-medium">{t("public.fixErrors")}</p>
            <ul className="ml-5 list-disc">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-[12px] text-ink-secondary">{t("public.submitHint")}</p>
        <div>
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? t("portal.loading") : t("public.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
