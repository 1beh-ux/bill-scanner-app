"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { ALLERGENS, DIET_FLAGS } from "@/lib/kitchen/allergens";

// Adults (2026-10-28): the 14 allergens + diet flags as tick lists, and "Přidat dospělého" (Lidé, Dospělí na akci).
const inputClass = "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

function toggle(list: string[], code: string, on: boolean) {
  return on ? [...list, code] : list.filter((c) => c !== code);
}

/** The 14 allergens with their official numbers. */
export function AllergenPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { lang } = useTranslations();
  return (
    <div className="grid gap-1 sm:grid-cols-2">
      {ALLERGENS.map((a) => (
        <label key={a.code} className="flex items-start gap-2 text-[13px] text-ink">
          <input type="checkbox" className="mt-0.5" checked={value.includes(a.code)} onChange={(e) => onChange(toggle(value, a.code, e.target.checked))} />
          <span>
            {a.no}. {lang === "en" ? a.en : a.cs}
          </span>
        </label>
      ))}
    </div>
  );
}

export function DietPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { lang } = useTranslations();
  return (
    <div className="flex flex-wrap gap-3">
      {DIET_FLAGS.map((d) => (
        <label key={d.code} className="flex items-center gap-1.5 text-[13px] text-ink">
          <input type="checkbox" checked={value.includes(d.code)} onChange={(e) => onChange(toggle(value, d.code, e.target.checked))} />
          {lang === "en" ? d.en : d.cs}
        </label>
      ))}
    </div>
  );
}

/**
 * "Přidat dospělého": name, birth date, address, allergens, diet -- no registration, family or portal link.
 * submit(adult) posts it where the page needs it (Lidé, or Dospělí na akci with the assignment) and returns ok.
 */
export function CreateAdultForm({ submit, onCancel }: { submit: (adult: Record<string, unknown>) => Promise<boolean>; onCancel: () => void }) {
  const { t } = useTranslations();
  const [a, setA] = useState({ firstName: "", lastName: "", dateOfBirth: "", street: "", municipality: "", zip: "", dietNote: "" });
  const [allergens, setAllergens] = useState<string[]>([]);
  const [dietFlags, setDietFlags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const field = (k: keyof typeof a, label: string, type = "text") => (
    <label className="flex flex-col gap-1 text-[13px] text-ink-secondary">
      {label}
      <input type={type} value={a[k]} onChange={(e) => setA({ ...a, [k]: e.target.value })} className={inputClass} />
    </label>
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const ok = await submit({ ...a, allergens, dietFlags });
    setBusy(false);
    if (!ok) setError(true);
  }
  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-lg border border-mist bg-paper p-4">
      <h3 className="text-[15px] font-semibold text-ink">{t("adults.createTitle")}</h3>
      <p className="text-[12.5px] text-ink-secondary">{t("adults.createHint")}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {field("firstName", t("adults.firstName"))}
        {field("lastName", t("adults.lastName"))}
        {field("dateOfBirth", t("adults.dateOfBirth"), "date")}
        {field("street", t("adults.street"))}
        {field("municipality", t("adults.municipality"))}
        {field("zip", t("adults.zip"))}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[13px] text-ink-secondary">{t("adults.allergens")}</span>
        <AllergenPicker value={allergens} onChange={setAllergens} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[13px] text-ink-secondary">{t("adults.diet")}</span>
        <DietPicker value={dietFlags} onChange={setDietFlags} />
      </div>
      {field("dietNote", t("adults.dietNote"))}
      {error && <p className="text-[13px] text-red-600">{t("adults.createFailed")}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={busy || (!a.firstName.trim() && !a.lastName.trim())} className={btnPrimary}>
          {t("adults.createSave")}
        </button>
        <button type="button" onClick={onCancel} className="text-[13px] text-ink-secondary hover:underline">
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
