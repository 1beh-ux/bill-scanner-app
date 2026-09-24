"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { visibleNavSections } from "@/lib/nav-sections";
import { useConfirm } from "@/components/ConfirmDialog";

const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";

type GoogleAccount = {
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
  valid: boolean;
  events: { id: string; name: string; status: string }[];
};

export default function SettingsPage() {
  const { t, roleLoaded, role, lang, setLang, theme, setTheme, hiddenModules, setHiddenModules } = useTranslations();
  const confirm = useConfirm();
  const [google, setGoogle] = useState<GoogleAccount | null>(null);
  // ?driveConnect=connected|error|in_use after coming back from Google's consent screen
  const [driveConnect] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("driveConnect")
  );
  const [disconnecting, setDisconnecting] = useState(false);
  const [landingPath, setLandingPath] = useState("");
  const [emailSignature, setEmailSignature] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/me/google-account")
      .then((r) => (r.ok ? r.json() : null))
      .then(setGoogle)
      .catch(() => {});
  }, []);

  async function disconnectGoogle() {
    const events = google?.events ?? [];
    const ok = await confirm({
      message:
        events.length > 0
          ? t("settingsPage.googleDisconnectWithEvents", { events: events.map((e) => e.name).join(", ") })
          : t("settingsPage.googleDisconnect"),
      confirmLabel: t("settingsPage.googleDisconnectButton"),
      danger: true,
    });
    if (!ok) return;
    setDisconnecting(true);
    await fetch("/api/me/google-account", { method: "DELETE" });
    const res = await fetch("/api/me/google-account");
    if (res.ok) setGoogle(await res.json());
    setDisconnecting(false);
  }

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setLandingPath(data?.landingPath ?? "");
        setEmailSignature(data?.emailSignature ?? "");
      })
      .finally(() => setLoading(false));
  }, []);

  function toggleModule(key: string, shown: boolean) {
    const next = shown ? hiddenModules.filter((m) => m !== key) : [...hiddenModules, key];
    setHiddenModules(next);
    fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hiddenModules: next }),
    }).catch(() => {});
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ landingPath: landingPath || null, emailSignature: emailSignature || null }),
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

        <div className="text-[13px] text-ink-secondary">
          <p className="mb-1">{t("settingsPage.modulesLabel")}</p>
          {(["health", "mail", "planning"] as const).map((key) => (
            <label key={key} className="mr-4 inline-flex items-center gap-2 text-ink">
              <input
                type="checkbox"
                checked={!hiddenModules.includes(key)}
                onChange={(e) => toggleModule(key, e.target.checked)}
              />
              {t(`nav.${key}`)}
            </label>
          ))}
          <span className="mt-1 block text-[11.5px]">{t("settingsPage.modulesHint")}</span>
        </div>

      </div>

      <div className="mb-6 border-b border-mist pb-6">
        <h2 className="mb-1 text-[15px] font-semibold text-ink">{t("settingsPage.googleTitle")}</h2>
        <p className="mb-2 text-[12px] text-ink-secondary">{t("settingsPage.googleHint")}</p>
        {driveConnect === "connected" && <p className="mb-2 text-[13px] text-pine">{t("driveSettings.connectDone")}</p>}
        {driveConnect === "error" && <p className="mb-2 text-[13px] text-red-600">{t("driveSettings.connectError")}</p>}
        {driveConnect === "in_use" && <p className="mb-2 text-[13px] text-red-600">{t("driveSettings.connectInUse")}</p>}
        {google?.connected ? (
          <p className="mb-2 text-[13px] text-ink">
            {t(google.valid ? "settingsPage.googleConnected" : "settingsPage.googleExpired", {
              email: google.email ?? "",
              date: google.connectedAt ? new Date(google.connectedAt).toLocaleDateString("cs-CZ") : "",
            })}
          </p>
        ) : (
          <p className="mb-2 text-[13px] text-ink-secondary">{t("settingsPage.googleNotConnected")}</p>
        )}
        {google && google.events.length > 0 && (
          <p className="mb-2 text-[12px] text-ink-secondary">
            {t("settingsPage.googleUsedBy", { events: google.events.map((e) => e.name).join(", ") })}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/mail-oauth/authorize?purpose=drive"
            className="rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2"
          >
            {google?.connected ? t("driveSettings.reconnect") : t("driveSettings.connectMine")}
          </a>
          {google?.connected && (
            <button
              type="button"
              onClick={disconnectGoogle}
              disabled={disconnecting}
              className="rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-red-600 hover:bg-paper-2 disabled:opacity-50"
            >
              {t("settingsPage.googleDisconnectButton")}
            </button>
          )}
        </div>
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

        <label className="text-[13px] text-ink-secondary">
          {t("settingsPage.emailSignatureLabel")}
          <input
            type="text"
            value={emailSignature}
            onChange={(e) => setEmailSignature(e.target.value)}
            placeholder={t("settingsPage.emailSignaturePlaceholder")}
            className={inputClass + " mt-1"}
          />
          <span className="mt-1 block text-[11.5px] text-ink-secondary">{t("settingsPage.emailSignatureHint")}</span>
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
