"use client";

import { useEffect, useState } from "react";
import { MEMBERSHIP_PRESET, readPriceRules, rulePrice, schoolYearStart, type PriceCategory, type PriceRules } from "@/lib/price-rules";

// Event settings -> "Ceny" (docs/registration-slice3-spec.md C): simple mode =
// today's member / non-member price (the fields above, Event.priceRules null);
// rules mode = price categories, school-year date, household minimum, the
// "Oddíl" field, a one-click preset and a preview of example combinations.
type FieldOption = { key: string; label: string; fieldType: string };

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btn = "rounded-lg border border-mist px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2 disabled:opacity-50";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const num = (v: string) => (v.trim() === "" ? undefined : Number(v));

export default function PriceSettings({
  eventId,
  event,
  onSaved,
  t,
}: {
  eventId: string;
  event: { priceRules: unknown; startDate: string };
  onSaved: () => void;
  t: (key: string, vars?: Record<string, string>) => string;
}) {
  const initial = readPriceRules(event.priceRules);
  const [mode, setMode] = useState<"simple" | "rules">(initial ? "rules" : "simple");
  const [rules, setRules] = useState<PriceRules>(initial ?? { ...MEMBERSHIP_PRESET, categories: [] });
  const [fields, setFields] = useState<FieldOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/events/${eventId}/participant-fields`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: FieldOption[]) => setFields(Array.isArray(d) ? d.filter((f) => f.fieldType === "select") : []))
      .catch(() => {});
  }, [eventId]);

  const setCat = (i: number, patch: Partial<PriceCategory>) => setRules((r) => ({ ...r, categories: r.categories.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const clean = readPriceRules(rules);

  async function save() {
    if (mode === "rules" && !clean) return setMessage(t("priceRules.invalid"));
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceRules: mode === "rules" ? clean : null }),
    });
    setSaving(false);
    setMessage(res.ok ? t("portalSettings.saved") : t("registrationSettings.saveFailed"));
    if (res.ok) onSaved();
  }

  // Preview: each category alone / as a member / in a household / from the school-year date.
  const start = new Date(event.startDate);
  const schoolDate = clean ? schoolYearStart(clean, start) : null;
  const preview = clean
    ? clean.categories.flatMap((c) => {
        const isAdult = !c.forChildren;
        const p = (isMember: boolean, householdCount: number, createdAt: Date) => rulePrice(clean, { category: c.key, isAdult, isMember, createdAt, eventStart: start, householdCount });
        const before = new Date(start.getTime() + 86400000);
        return [
          { label: t("priceRules.previewAlone"), price: p(false, 1, before) },
          ...(c.memberPriceCzk !== undefined ? [{ label: t("priceRules.previewMember"), price: p(true, 1, before) }] : []),
          ...(c.householdDiscountCzk ? [{ label: t("priceRules.previewHousehold", { count: String(clean.householdMinMembers) }), price: p(false, clean.householdMinMembers, before) }] : []),
          ...(c.schoolYearPriceCzk !== undefined && schoolDate ? [{ label: t("priceRules.previewSchoolYear", { date: schoolDate.toLocaleDateString("cs-CZ", { timeZone: "UTC" }) }), price: p(false, clean.householdMinMembers, schoolDate) }] : []),
        ].map((row) => ({ ...row, category: c.label }));
      })
    : [];

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <h3 className="text-[15px] font-semibold text-ink">{t("priceRules.title")}</h3>
      <div className="flex flex-wrap gap-4 text-[14px] text-ink">
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "simple"} onChange={() => setMode("simple")} />
          {t("priceRules.modeSimple")}
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "rules"} onChange={() => setMode("rules")} />
          {t("priceRules.modeRules")}
        </label>
      </div>
      <p className="text-[12px] text-ink-secondary">{t(mode === "simple" ? "priceRules.simpleHint" : "priceRules.rulesHint")}</p>

      {mode === "rules" && (
        <>
          <div>
            <button type="button" onClick={() => setRules(MEMBERSHIP_PRESET)} className={btn}>
              {t("priceRules.preset")}
            </button>
          </div>
          {rules.categories.map((c, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-mist p-2 sm:grid-cols-6">
              <label className="text-[12px] text-ink-secondary sm:col-span-1">
                {t("priceRules.key")}
                <input value={c.key} onChange={(e) => setCat(i, { key: e.target.value })} className={inputClass + " mt-0.5"} />
              </label>
              <label className="text-[12px] text-ink-secondary sm:col-span-5">
                {t("priceRules.label")}
                <input value={c.label} onChange={(e) => setCat(i, { label: e.target.value })} className={inputClass + " mt-0.5"} />
              </label>
              {(
                [
                  ["priceCzk", "priceRules.price"],
                  ["memberPriceCzk", "priceRules.memberPrice"],
                  ["schoolYearPriceCzk", "priceRules.schoolYearPrice"],
                  ["householdDiscountCzk", "priceRules.householdDiscount"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="text-[12px] text-ink-secondary sm:col-span-1">
                  {t(label)}
                  <input
                    type="number"
                    min={0}
                    value={c[k] ?? ""}
                    onChange={(e) => setCat(i, { [k]: k === "priceCzk" ? (num(e.target.value) ?? 0) : num(e.target.value) })}
                    className={inputClass + " mt-0.5"}
                  />
                </label>
              ))}
              <div className="flex flex-col justify-end gap-1 text-[12px] text-ink sm:col-span-2">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={c.forChildren} onChange={(e) => setCat(i, { forChildren: e.target.checked })} />
                  {t("priceRules.forChildren")}
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={c.forAdults} onChange={(e) => setCat(i, { forAdults: e.target.checked })} />
                  {t("priceRules.forAdults")}
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={!!c.asksOddil} onChange={(e) => setCat(i, { asksOddil: e.target.checked || undefined })} />
                  {t("priceRules.asksOddil")}
                </label>
                <button type="button" onClick={() => setRules((r) => ({ ...r, categories: r.categories.filter((_, j) => j !== i) }))} className="self-start text-red-600 hover:underline">
                  {t("common.delete")}
                </button>
              </div>
            </div>
          ))}
          <div>
            <button
              type="button"
              onClick={() => setRules((r) => ({ ...r, categories: [...r.categories, { key: `kat${r.categories.length + 1}`, label: "", forAdults: true, forChildren: true, priceCzk: 0 }] }))}
              className={btn}
            >
              + {t("priceRules.addCategory")}
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-[12px] text-ink-secondary">
              {t("priceRules.schoolYearFrom")}
              <input value={rules.schoolYearFrom} onChange={(e) => setRules((r) => ({ ...r, schoolYearFrom: e.target.value }))} placeholder="09-01" className={inputClass + " mt-0.5"} />
            </label>
            <label className="text-[12px] text-ink-secondary">
              {t("priceRules.householdMin")}
              <input type="number" min={2} value={rules.householdMinMembers} onChange={(e) => setRules((r) => ({ ...r, householdMinMembers: Number(e.target.value) }))} className={inputClass + " mt-0.5"} />
            </label>
            <label className="text-[12px] text-ink-secondary">
              {t("priceRules.oddilField")}
              <select value={rules.oddilFieldKey ?? ""} onChange={(e) => setRules((r) => ({ ...r, oddilFieldKey: e.target.value || undefined }))} className={inputClass + " mt-0.5"}>
                <option value="">—</option>
                {fields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {preview.length > 0 && (
            <table className="w-full border-collapse text-[13px]">
              <caption className="mb-1 text-left text-[12px] font-medium text-ink-secondary">{t("priceRules.previewTitle")}</caption>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className="border-b border-mist/60">
                    <td className="p-1.5 text-ink">{row.category}</td>
                    <td className="p-1.5 text-ink-secondary">{row.label}</td>
                    <td className="p-1.5 text-right text-ink">{row.price != null ? `${row.price} Kč` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {message && <p className="text-[13px] text-ink">{message}</p>}
      <div className="flex justify-end">
        <button type="button" onClick={save} disabled={saving} className={btnPrimary}>
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}
