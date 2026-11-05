"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import KitchenLists from "./KitchenLists";
import { inputSm, send } from "./ui";

// Nastavení akce -> Kuchyně: the allergy field, the food categories (cena na osobu a den), who counts,
// when "Jak to dopadlo" unlocks; the event's meal slots and age bands.
type Settings = { allergyFieldKey: string | null; foodCategoryIds: string[]; countOnlyAccepted: boolean; feedbackUnlockMinutes: number };

export default function KitchenSettings({ eventId }: { eventId: string }) {
  const { t } = useTranslations();
  const [s, setS] = useState<Settings | null>(null);
  const [detected, setDetected] = useState<string | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [fields, setFields] = useState<{ key: string; label: string }[]>([]);
  const load = useCallback(async () => {
    const [k, d] = await Promise.all([fetch(`/api/events/${eventId}/kitchen`).then((r) => (r.ok ? r.json() : null)), fetch(`/api/events/${eventId}/kitchen/diets`).then((r) => (r.ok ? r.json() : null))]);
    if (k) {
      setS(k.settings);
      setDetected(k.allergyFieldKey);
      setCategories(k.categories);
    }
    if (d) setFields(d.fields);
  }, [eventId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load
    load();
  }, [load]);
  // Linked from Kuchyně's price box (#kitchen-food-categories): scroll there once the section exists.
  useEffect(() => {
    if (s && window.location.hash === "#kitchen-food-categories") document.getElementById("kitchen-food-categories")?.scrollIntoView({ block: "start" });
  }, [s]);
  if (!s) return null;
  const save = async (patch: Partial<Settings>) => {
    setS({ ...s, ...patch });
    await send(`/api/events/${eventId}/kitchen`, "PATCH", patch);
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <label className="flex max-w-md flex-col gap-1 text-[13px] text-ink-secondary">
          {t("kitchen.settings.allergyField")}
          <select value={s.allergyFieldKey ?? ""} onChange={(e) => save({ allergyFieldKey: e.target.value || null })} className={inputSm}>
            <option value="">{t("kitchen.settings.allergyAuto", { field: fields.find((f) => f.key === detected)?.label ?? "—" })}</option>
            {fields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <div id="kitchen-food-categories" className="flex scroll-mt-20 flex-col gap-1">
          <span className="text-[13px] text-ink-secondary">{t("kitchen.settings.foodCategories")}</span>
          <div className="flex flex-wrap gap-3">
            {categories.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 text-[13px] text-ink">
                <input type="checkbox" checked={s.foodCategoryIds.includes(c.id)} onChange={(e) => save({ foodCategoryIds: e.target.checked ? [...s.foodCategoryIds, c.id] : s.foodCategoryIds.filter((x) => x !== c.id) })} />
                {c.name}
              </label>
            ))}
            {categories.length === 0 && <span className="text-[13px] text-ink-secondary">—</span>}
          </div>
          <span className="text-[11.5px] text-ink-secondary">{t("kitchen.settings.foodCategoriesHint")}</span>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input type="checkbox" checked={s.countOnlyAccepted} onChange={(e) => save({ countOnlyAccepted: e.target.checked })} />
          {t("kitchen.settings.countOnlyAccepted")}
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink">
          {t("kitchen.settings.feedbackUnlock")}
          <input type="number" min={0} max={600} defaultValue={s.feedbackUnlockMinutes} onBlur={(e) => save({ feedbackUnlockMinutes: Number(e.target.value) || 0 })} className={inputSm + " w-20"} />
          {t("kitchen.settings.minutes")}
        </label>
      </section>
      <KitchenLists kind="kitchen_slot" scope="event" eventId={eventId} />
      <KitchenLists kind="kitchen_band" scope="event" eventId={eventId} />
      <div className="flex flex-wrap gap-4 text-[13px]">
        <a href={`/events/${eventId}/kitchen`} className="text-ember hover:underline">{t("kitchen.navPlan")}</a>
        <a href={`/events/${eventId}/kitchen/library`} className="text-ember hover:underline">{t("kitchen.navLibrary")}</a>
        <a href={`/events/${eventId}/adults`} className="text-ember hover:underline">{t("adults.navTitle")}</a>
      </div>
    </div>
  );
}
