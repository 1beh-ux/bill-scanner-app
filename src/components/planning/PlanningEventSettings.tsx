"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { DEFAULT_DISPLAY, type PlanDisplaySettings } from "@/lib/planning";
import { DEFAULT_SHEET_STYLE, type SheetStyle } from "@/lib/planning-sheet";
import SheetStyleSettings from "./SheetStyleSettings";

// Nastavení akce -> Plánování: board display (cards, undo depth) and the Google
// Sheet export design -- per event, shared by everyone planning it.
export default function PlanningEventSettings({ eventId }: { eventId: string }) {
  const { t } = useTranslations();
  const [display, setDisplay] = useState<PlanDisplaySettings>(DEFAULT_DISPLAY);
  const [sheetStyle, setSheetStyle] = useState<SheetStyle>(DEFAULT_SHEET_STYLE);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/events/${eventId}/planning/settings`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!s) return;
        setDisplay(s.display);
        setSheetStyle(s.sheetStyle);
      });
  }, [eventId]);

  async function save(patch: { display?: PlanDisplaySettings; sheetStyle?: SheetStyle }) {
    const res = await fetch(`/api/events/${eventId}/planning/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return;
    const next = await res.json();
    setDisplay(next.display);
    setSheetStyle(next.sheetStyle);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }
  const setAndSave = (patch: Partial<PlanDisplaySettings>) => {
    const next = { ...display, ...patch };
    setDisplay(next);
    save({ display: next });
  };

  const numberInput = (key: "descriptionChars" | "undoSteps", min: number, max: number, disabled = false) => (
    <input
      type="number"
      min={min}
      max={max}
      value={display[key]}
      disabled={disabled}
      onChange={(e) => setDisplay({ ...display, [key]: Number(e.target.value) })}
      onBlur={() => save({ display })}
      className="w-20 rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember disabled:opacity-50"
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2 text-[13px]">
        <h3 className="text-[15px] font-semibold text-ink">
          {t("planSettings.displayTitle")} {saved && <span className="text-[12px] font-normal text-pine">✓</span>}
        </h3>
        <p className="text-[12px] text-ink-secondary">{t("planSettings.cardsHint")}</p>
        {(
          [
            ["showDescription", "settingsPage.planningCardShowDescription"],
            ["showMeta", "settingsPage.planningCardShowMeta"],
            ["showGroups", "settingsPage.planningCardShowGroups"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="inline-flex items-center gap-2 text-ink">
            <input type="checkbox" checked={display[key]} onChange={(e) => setAndSave({ [key]: e.target.checked })} />
            {t(label)}
          </label>
        ))}
        <label className="inline-flex items-center gap-2 text-ink">
          {t("settingsPage.planningCardDescriptionChars")}
          {numberInput("descriptionChars", 10, 1000, !display.showDescription)}
        </label>
        <label className="inline-flex items-center gap-2 text-ink">
          {t("planSettings.undoSteps")}
          {numberInput("undoSteps", 1, 50)}
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[15px] font-semibold text-ink">{t("planSettings.sheetTitle")}</h3>
        <SheetStyleSettings value={sheetStyle} onChange={(next) => save({ sheetStyle: next })} />
      </section>
    </div>
  );
}
