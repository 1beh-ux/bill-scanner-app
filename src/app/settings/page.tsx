"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { visibleNavSections } from "@/lib/nav-sections";

const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";

export default function SettingsPage() {
  const { t, roleLoaded, role, lang, setLang, theme, setTheme } = useTranslations();
  const [landingPath, setLandingPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setLandingPath(data?.landingPath ?? ""))
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ landingPath: landingPath || null }),
    });
    setSaving(false);
    if (res.ok) setSaved(true);
  }

  if (!roleLoaded || loading) return null;

  return (
    <div className="mx-auto max-w-xl p-4 md:p-8">
      <h1 className="mb-6 text-[22px] font-semibold text-ink">{t("nav.personalSettings")}</h1>

      <div className="mb-6 flex flex-col gap-3 border-b border-mist pb-6">
        <label className="text-[13px] text-ink-secondary">
          {t("settingsPage.languageLabel")}
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as "cs" | "en")}
            className={inputClass + " mt-1"}
          >
            <option value="cs">Čeština</option>
            <option value="en">English</option>
          </select>
        </label>

        <label className="text-[13px] text-ink-secondary">
          {t("settingsPage.themeLabel")}
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as "light" | "dark")}
            className={inputClass + " mt-1"}
          >
            <option value="light">{t("settingsPage.themeLight")}</option>
            <option value="dark">{t("settingsPage.themeDark")}</option>
          </select>
        </label>
      </div>

      <form onSubmit={save} className="flex flex-col gap-3">
        <label className="text-[13px] text-ink-secondary">
          {t("settingsPage.landingPathLabel")}
          <select
            value={landingPath}
            onChange={(e) => setLandingPath(e.target.value)}
            className={inputClass + " mt-1"}
          >
            <option value="">{t("settingsPage.landingPathDefault")}</option>
            {visibleNavSections(role).map((section) => (
              <optgroup key={section.sectionLabelKey} label={t(section.sectionLabelKey)}>
                {section.items.map((item) => (
                  <option key={item.path} value={item.path}>
                    {t(item.labelKey)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <div className="mt-2 flex items-center gap-3">
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? t("common.loading") : t("common.save")}
          </button>
          {saved && <span className="text-[13px] text-pine">{t("settingsPage.saved")}</span>}
        </div>
      </form>
    </div>
  );
}
