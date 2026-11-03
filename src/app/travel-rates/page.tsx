"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import HelpLink from "@/components/HelpLink";

// Organizace -> Sazby cestovních náhrad (organization admins): rate sets by valid-from date, the organization's
// details printed on orders, and the events no set covers.
type Pair = { manual: number | string; auto: number | string };
type RateSet = {
  id: string;
  validFrom: string;
  basePerKm: string;
  trailerSurchargePct: string;
  dieselPrice: string;
  petrol95Price: string;
  petrol98Price: string;
  electricityPrice: string;
  consumptionDefaults: { petrol: Pair; diesel: Pair; electric: Pair };
  note: string | null;
};
type Draft = Omit<RateSet, "id"> & { id?: string };
type Org = { name: string; address: string | null; ico: string | null; city: string | null };
type Missing = { eventId: string; name: string; startDate: string; firstValidFrom: string | null };

const input = "w-full rounded-lg border border-mist bg-paper-2 px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btn = "rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2 disabled:opacity-50";
const btnPrimary = "rounded-lg bg-ember px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const PRICES = ["basePerKm", "trailerSurchargePct", "dieselPrice", "petrol95Price", "petrol98Price", "electricityPrice"] as const;
const GROUPS = ["petrol", "diesel", "electric"] as const;
const day = (iso: string) => iso.slice(0, 10);
const czDate = (iso: string) => new Date(`${day(iso)}T00:00:00Z`).toLocaleDateString("cs-CZ", { timeZone: "UTC" });
const today = () => new Date().toISOString().slice(0, 10);
const blank: Draft = {
  validFrom: today(), basePerKm: "", trailerSurchargePct: "15", dieselPrice: "", petrol95Price: "", petrol98Price: "", electricityPrice: "",
  consumptionDefaults: { petrol: { manual: 6.9, auto: 7.6 }, diesel: { manual: 5.8, auto: 6.4 }, electric: { manual: 0, auto: 0 } }, note: "",
};

export default function TravelRatesPage() {
  const { t, role, roleLoaded } = useTranslations();
  const confirm = useConfirm();
  const [sets, setSets] = useState<RateSet[] | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [missing, setMissing] = useState<Missing[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orgSaved, setOrgSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/travel-rates").catch(() => null);
    if (!res?.ok) return setSets([]);
    const data = await res.json();
    setSets(data.sets);
    setOrg(data.org);
    setMissing(data.missing);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    load();
  }, [load]);

  if (roleLoaded && role !== "admin") return <div className="p-8 text-[14px] text-ink-secondary">{t("common.adminOnly")}</div>;

  async function save() {
    if (!draft) return;
    setError(null);
    const res = await fetch(draft.id ? `/api/travel-rates/${draft.id}` : "/api/travel-rates", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    }).catch(() => null);
    if (!res?.ok) {
      const j = await res?.json().catch(() => null);
      setError(j?.error === "valid_from_taken" ? t("travelRates.error.validFromTaken") : j?.bad ? t("travelRates.error.bad", { fields: j.bad.map((f: string) => t(`travelRates.field.${f.split(".")[0]}`)).join(", ") }) : t("travelRates.error.generic"));
      return;
    }
    setDraft(null);
    load();
  }

  async function remove(s: RateSet) {
    if (!(await confirm({ message: t("travelRates.deleteConfirm", { date: czDate(s.validFrom) }), danger: true }))) return;
    await fetch(`/api/travel-rates/${s.id}`, { method: "DELETE" }).catch(() => null);
    load();
  }

  async function saveOrg() {
    if (!org) return;
    const res = await fetch("/api/travel-rates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(org) }).catch(() => null);
    if (res?.ok) {
      setOrg(await res.json());
      setOrgSaved(true);
      setTimeout(() => setOrgSaved(false), 2000);
    }
  }

  // "Zkopírovat z předchozí": everything from the newest set, a new valid-from.
  const copyLatest = () => sets?.[0] && setDraft({ ...sets[0], id: undefined, validFrom: today(), note: sets[0].note ?? "" });
  const set = (k: keyof Draft, v: string) => draft && setDraft({ ...draft, [k]: v });
  const setPair = (g: (typeof GROUPS)[number], k: keyof Pair, v: string) =>
    draft && setDraft({ ...draft, consumptionDefaults: { ...draft.consumptionDefaults, [g]: { ...draft.consumptionDefaults[g], [k]: v } } });

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <div className="flex items-center gap-2">
        <h1 className="text-[22px] font-semibold text-ink">{t("travelRates.title")}</h1>
        <HelpLink slug="cestovni-prikazy" />
      </div>
      <p className="mb-4 text-[13px] text-ink-secondary">{t("travelRates.hint")}</p>

      {missing.map((m) => (
        <div key={m.eventId} className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {m.firstValidFrom
            ? t("travelRates.missingEvent", { name: m.name, start: czDate(m.startDate), first: czDate(m.firstValidFrom) })
            : t("travelRates.missingAll", { name: m.name, start: czDate(m.startDate) })}
        </div>
      ))}

      {org && (
        <section className="mb-6 rounded-lg border border-mist bg-paper p-4">
          <h2 className="mb-1 text-[15px] font-semibold text-ink">{t("travelRates.orgTitle")}</h2>
          <p className="mb-3 text-[12px] text-ink-secondary">{t("travelRates.orgHint", { name: org.name })}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-[12px] text-ink-secondary sm:col-span-3">
              {t("travelRates.orgAddress")}
              <input className={input} value={org.address ?? ""} onChange={(e) => setOrg({ ...org, address: e.target.value })} />
            </label>
            <label className="text-[12px] text-ink-secondary">
              {t("travelRates.orgIco")}
              <input className={input} value={org.ico ?? ""} onChange={(e) => setOrg({ ...org, ico: e.target.value })} />
            </label>
            <label className="text-[12px] text-ink-secondary">
              {t("travelRates.orgCity")}
              <input className={input} value={org.city ?? ""} onChange={(e) => setOrg({ ...org, city: e.target.value })} placeholder="Praze" />
            </label>
            <div className="flex items-end gap-2">
              <button type="button" className={btnPrimary} onClick={saveOrg}>
                {t("common.save")}
              </button>
              {orgSaved && <span className="text-[12px] text-ink-secondary">✓</span>}
            </div>
          </div>
        </section>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} onClick={() => setDraft({ ...blank, validFrom: today() })}>
          + {t("travelRates.add")}
        </button>
        <button type="button" className={btn} disabled={!sets?.length} onClick={copyLatest}>
          {t("travelRates.copyLatest")}
        </button>
      </div>

      {draft && (
        <section className="mb-6 rounded-lg border border-ember/40 bg-paper p-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-[12px] text-ink-secondary">
              {t("travelRates.field.validFrom")}
              <input type="date" className={input} value={day(draft.validFrom)} onChange={(e) => set("validFrom", e.target.value)} />
            </label>
            {PRICES.map((f) => (
              <label key={f} className="text-[12px] text-ink-secondary">
                {t(`travelRates.field.${f}`)}
                <input inputMode="decimal" className={input} value={String(draft[f])} onChange={(e) => set(f, e.target.value)} />
              </label>
            ))}
          </div>
          <h3 className="mb-1 mt-4 text-[13px] font-semibold text-ink">{t("travelRates.consumptionTitle")}</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {GROUPS.map((g) => (
              <div key={g} className="text-[12px] text-ink-secondary">
                {t(`travelRates.group.${g}`)}
                <div className="flex gap-2">
                  <input inputMode="decimal" aria-label={`${t(`travelRates.group.${g}`)} ${t("travelRates.manual")}`} placeholder={t("travelRates.manual")} className={input} value={String(draft.consumptionDefaults[g].manual)} onChange={(e) => setPair(g, "manual", e.target.value)} />
                  <input inputMode="decimal" aria-label={`${t(`travelRates.group.${g}`)} ${t("travelRates.auto")}`} placeholder={t("travelRates.auto")} className={input} value={String(draft.consumptionDefaults[g].auto)} onChange={(e) => setPair(g, "auto", e.target.value)} />
                </div>
              </div>
            ))}
          </div>
          <label className="mt-3 block text-[12px] text-ink-secondary">
            {t("travelRates.field.note")}
            <input className={input} value={draft.note ?? ""} onChange={(e) => set("note", e.target.value)} placeholder="Vyhláška č. …/… Sb." />
          </label>
          {error && <p className="mt-2 text-[13px] text-red-700">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" className={btnPrimary} onClick={save}>
              {t("common.save")}
            </button>
            <button type="button" className={btn} onClick={() => setDraft(null)}>
              {t("common.cancel")}
            </button>
          </div>
        </section>
      )}

      {!sets ? (
        <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
      ) : sets.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("travelRates.none")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-mist">
          <table className="w-full text-[13px]">
            <thead className="bg-paper-2 text-left text-ink-secondary">
              <tr>
                <th className="p-2">{t("travelRates.field.validFrom")}</th>
                {PRICES.map((f) => (
                  <th key={f} className="p-2">
                    {t(`travelRates.short.${f}`)}
                  </th>
                ))}
                <th className="p-2">{t("travelRates.consumptionShort")}</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {sets.map((s) => (
                <tr key={s.id} className="border-t border-mist align-top">
                  <td className="whitespace-nowrap p-2 font-medium text-ink">
                    {czDate(s.validFrom)}
                    {s.note && <div className="max-w-[16rem] text-[11px] font-normal text-ink-secondary">{s.note}</div>}
                  </td>
                  {PRICES.map((f) => (
                    <td key={f} className="whitespace-nowrap p-2 tabular-nums">
                      {Number(s[f]).toLocaleString("cs-CZ", { minimumFractionDigits: f === "trailerSurchargePct" ? 0 : 2 })}
                    </td>
                  ))}
                  <td className="whitespace-nowrap p-2 text-[12px] text-ink-secondary">
                    {GROUPS.map((g) => `${t(`travelRates.group.${g}`)} ${s.consumptionDefaults[g].manual}/${s.consumptionDefaults[g].auto}`).join(" · ")}
                  </td>
                  <td className="whitespace-nowrap p-2 text-right">
                    <button type="button" className="mr-3 text-ember hover:underline" onClick={() => setDraft({ ...s, note: s.note ?? "" })}>
                      {t("common.edit")}
                    </button>
                    <button type="button" className="text-red-700 hover:underline" onClick={() => remove(s)}>
                      {t("common.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
