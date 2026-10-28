"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { AllergenPicker, DietPicker } from "@/components/adults/AdultForm";

// Lidé -> an adult: allergens, diet flags and a note (Kuchyně reads them). Organization admins (the page is theirs).
export default function AdultFoodCard({ childId, initial }: { childId: string; initial: { allergens: string[]; dietFlags: string[]; dietNote: string | null } }) {
  const { t } = useTranslations();
  const [allergens, setAllergens] = useState(initial.allergens);
  const [dietFlags, setDietFlags] = useState(initial.dietFlags);
  const [dietNote, setDietNote] = useState(initial.dietNote ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const res = await fetch(`/api/children/${childId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allergens, dietFlags, dietNote }) }).catch(() => null);
    setBusy(false);
    setMessage(t(res?.ok ? "appearance.saved" : "appearance.failed"));
  }
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[15px] font-semibold text-ink">{t("adults.foodTitle")}</h2>
      <p className="text-[12.5px] text-ink-secondary">{t("adults.foodHint")}</p>
      <span className="text-[13px] text-ink-secondary">{t("adults.allergens")}</span>
      <AllergenPicker value={allergens} onChange={setAllergens} />
      <span className="text-[13px] text-ink-secondary">{t("adults.diet")}</span>
      <DietPicker value={dietFlags} onChange={setDietFlags} />
      <label className="flex flex-col gap-1 text-[13px] text-ink-secondary">
        {t("adults.dietNote")}
        <input value={dietNote} onChange={(e) => setDietNote(e.target.value)} maxLength={1000} className="w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink" />
      </label>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50">
          {t("common.save")}
        </button>
        {message && <span className="text-[13px] text-ink">{message}</span>}
      </div>
    </section>
  );
}
