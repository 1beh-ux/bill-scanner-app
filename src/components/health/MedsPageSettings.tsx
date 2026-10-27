"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { MEDS_FONT_SIZES, MEDS_PRESETS, readMedsPageSettings, type MedsPageSettings } from "@/lib/meds-page-settings";

// Nastavení akce -> Zdraví -> "Léky a výdej": the page's font size, its date buttons (+ the first one) and print defaults.
const selectClass = "mt-1 block rounded-lg border border-mist bg-paper-2 px-2 py-1.5 text-[13px] text-ink";

export default function MedsPageSettingsCard({ eventId }: { eventId: string }) {
  const { t } = useTranslations();
  const [s, setS] = useState<MedsPageSettings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/events/${eventId}/meds-settings`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setS(readMedsPageSettings(d)))
      .catch(() => setS(readMedsPageSettings(null)));
  }, [eventId]);

  async function save(next: MedsPageSettings) {
    setS(readMedsPageSettings(next));
    setMessage(null);
    const res = await fetch(`/api/events/${eventId}/meds-settings`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => null);
    setMessage(t(res?.ok ? "appearance.saved" : "appearance.failed"));
  }

  if (!s) return null;
  return (
    <section>
      <h3 className="mb-1 text-[15px] font-semibold text-ink">{t("medsSettings.title")}</h3>
      <p className="mb-3 max-w-md text-[12.5px] text-ink-secondary">{t("medsSettings.hint")}</p>
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-[12px] text-ink-secondary">
          {t("medsSettings.fontSize")}
          <select value={s.fontSize} onChange={(e) => save({ ...s, fontSize: e.target.value as MedsPageSettings["fontSize"] })} className={selectClass}>
            {MEDS_FONT_SIZES.map((f) => (
              <option key={f} value={f}>
                {t(`medsSettings.size.${f}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] text-ink-secondary">
          {t("medsSettings.defaultPreset")}
          <select value={s.defaultPreset} onChange={(e) => save({ ...s, defaultPreset: e.target.value as MedsPageSettings["defaultPreset"] })} className={selectClass}>
            {s.presets.map((p) => (
              <option key={p} value={p}>
                {t(`medGridPage.preset.${p}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] text-ink-secondary">
          {t("pdfExport.modeLabel")}
          <select value={s.exportMode} onChange={(e) => save({ ...s, exportMode: e.target.value as MedsPageSettings["exportMode"] })} className={selectClass}>
            <option value="blank">{t("pdfExport.modeBlank")}</option>
            <option value="hybrid">{t("pdfExport.modeHybrid")}</option>
          </select>
        </label>
        <label className="text-[12px] text-ink-secondary">
          {t("pdfExport.formatLabel")}
          <select value={s.exportFormat} onChange={(e) => save({ ...s, exportFormat: e.target.value as MedsPageSettings["exportFormat"] })} className={selectClass}>
            <option value="A4">A4</option>
            <option value="A3">A3</option>
          </select>
        </label>
      </div>
      <fieldset className="mt-3 flex flex-wrap items-center gap-3 text-[13px] text-ink">
        <legend className="mb-1 text-[12px] text-ink-secondary">{t("medsSettings.presets")}</legend>
        {MEDS_PRESETS.map((p) => (
          <label key={p} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={s.presets.includes(p)}
              onChange={(e) => save({ ...s, presets: e.target.checked ? MEDS_PRESETS.filter((x) => x === p || s.presets.includes(x)) : s.presets.filter((x) => x !== p) })}
            />
            {t(`medGridPage.preset.${p}`)}
          </label>
        ))}
      </fieldset>
      {message && <p className="mt-2 text-[12.5px] text-ink">{message}</p>}
    </section>
  );
}
