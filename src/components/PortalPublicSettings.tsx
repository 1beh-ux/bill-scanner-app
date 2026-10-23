"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";

// Organizace -> Vzhled -> Rodičovský portál a kontakt (2026-10-23): the contact on the public pages,
// "Zapomněl(a) jsem odkaz do portálu" and "Ještě nejsem členem organizace" on the portal sign-in screens.
type Settings = { contactEmail: string | null; portalRecoverySenderEmail: string | null; portalRecoveryNewLink: boolean; portalJoinEventId: string | null; portalJoinUrl: string | null };
type View = { settings: Settings; mailboxes: string[]; events: { id: string; name: string }[] };
const inputClass = "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const label = "text-[13px] text-ink-secondary";
const hint = "mt-1 block text-[11.5px]";

export default function PortalPublicSettings() {
  const { t } = useTranslations();
  const [view, setView] = useState<View | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const take = (v: View) => {
    setView(v);
    setForm(v.settings);
  };
  useEffect(() => {
    fetch("/api/organizations/portal-settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => v && take(v))
      .catch(() => {});
  }, []);

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/organizations/portal-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).catch(() => null);
    setBusy(false);
    if (res?.ok) take(await res.json());
    setMessage(t(res?.ok ? "appearance.saved" : "portalSettings2.failed"));
  }

  if (!view || !form) return null;
  const set = (p: Partial<Settings>) => setForm({ ...form, ...p });
  return (
    <section className="mx-auto max-w-5xl px-4 pb-8 md:px-8">
      <h2 className="mb-1 text-[16px] font-semibold text-ink">{t("portalSettings2.title")}</h2>
      <div className="flex max-w-xl flex-col gap-3">
        <label className={label}>
          {t("portalSettings2.contact")}
          <input type="email" value={form.contactEmail ?? ""} onChange={(e) => set({ contactEmail: e.target.value })} className={inputClass + " mt-1"} />
          <span className={hint}>{t("portalSettings2.contactHint")}</span>
        </label>
        <label className={label}>
          {t("portalSettings2.recoverySender")}
          <select value={form.portalRecoverySenderEmail ?? ""} onChange={(e) => set({ portalRecoverySenderEmail: e.target.value || null })} className={inputClass + " mt-1"}>
            <option value="">{t("portalSettings2.recoveryOff")}</option>
            {view.mailboxes.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <span className={hint}>{t("portalSettings2.recoveryHint")}</span>
        </label>
        {form.portalRecoverySenderEmail && (
          <div className="flex flex-col gap-1 text-[14px] text-ink">
            <label className="flex items-start gap-2">
              <input type="radio" checked={!form.portalRecoveryNewLink} onChange={() => set({ portalRecoveryNewLink: false })} className="mt-1" />
              <span>{t("portalSettings2.recoverySame")}</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" checked={form.portalRecoveryNewLink} onChange={() => set({ portalRecoveryNewLink: true })} className="mt-1" />
              <span>{t("portalSettings2.recoveryNew")}</span>
            </label>
          </div>
        )}
        <label className={label}>
          {t("portalSettings2.joinEvent")}
          <select value={form.portalJoinEventId ?? ""} onChange={(e) => set({ portalJoinEventId: e.target.value || null })} className={inputClass + " mt-1"}>
            <option value="">{t("portalSettings2.joinNone")}</option>
            {view.events.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          {t("portalSettings2.joinUrl")}
          <input type="url" value={form.portalJoinUrl ?? ""} onChange={(e) => set({ portalJoinUrl: e.target.value })} placeholder="https://" className={inputClass + " mt-1"} />
          <span className={hint}>{t("portalSettings2.joinHint")}</span>
        </label>
        {message && <p className="text-[13px] text-ink">{message}</p>}
        <button type="button" onClick={save} disabled={busy} className="self-start rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50">
          {t("common.save")}
        </button>
      </div>
    </section>
  );
}
