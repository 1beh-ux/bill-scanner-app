"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";

const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";

// Only event-independent destinations -- an eventId baked into a landing
// path would go stale the moment that event closes or access changes.
function landingOptions(role: string | null): { path: string; labelKey: string }[] {
  return [
    { path: "/events", labelKey: "nav.events" },
    { path: "/authors", labelKey: "nav.authors" },
    { path: "/exchange-rates", labelKey: "nav.exchangeRates" },
    { path: "/templates", labelKey: "nav.templates" },
    ...(role === "admin" ? [{ path: "/users", labelKey: "nav.users" }] : []),
  ];
}

export default function SettingsPage() {
  const { t, roleLoaded, role } = useTranslations();
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

      <form onSubmit={save} className="flex flex-col gap-3">
        <label className="text-[13px] text-ink-secondary">
          {t("settingsPage.landingPathLabel")}
          <select
            value={landingPath}
            onChange={(e) => setLandingPath(e.target.value)}
            className={inputClass + " mt-1"}
          >
            <option value="">{t("settingsPage.landingPathDefault")}</option>
            {landingOptions(role).map((o) => (
              <option key={o.path} value={o.path}>
                {t(o.labelKey)}
              </option>
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

      <p className="mt-6 text-[13px] text-ink-secondary">{t("settingsPage.langThemeHint")}</p>
    </div>
  );
}
