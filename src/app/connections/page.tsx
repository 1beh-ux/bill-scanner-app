"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";

// Organizace -> Připojení (admin only). "Veřejné adresy": hostnames that serve
// only the public registration page and/or the parent portal (docs/custom-domain.md).
type Purpose = "registration" | "portal" | "both";
type Host = { id: string; hostname: string; purpose: Purpose; eventId: string | null; isDefault: boolean; active: boolean; event: { name: string } | null };
type Form = { id: string | null; hostname: string; purpose: Purpose; eventId: string; isDefault: boolean; active: boolean };
type Verify = { result: "ok" | "dns" | "tls" | "page" | "no_lb_ip"; detail?: string };

const inputClass = "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const linkBtn = "text-[13px] text-ember hover:underline disabled:opacity-50";
const PURPOSE_KEY: Record<Purpose, string> = { registration: "connections.purposeRegistration", portal: "connections.purposePortal", both: "connections.purposeBoth" };
const EMPTY: Form = { id: null, hostname: "", purpose: "registration", eventId: "", isDefault: false, active: true };

/** The one-time Google Cloud setup for a new hostname (certificate + map entry in tabornik-map). */
function gcloudCommands(hostname: string): string {
  const n = hostname.replace(/\./g, "-");
  return [
    `gcloud certificate-manager dns-authorizations create ${n}-auth --domain=${hostname}`,
    `gcloud certificate-manager dns-authorizations describe ${n}-auth   # CNAME _acme-challenge... -> add at the domain's DNS`,
    `gcloud certificate-manager certificates create ${n}-cert --domains=${hostname} --dns-authorizations=${n}-auth`,
    `gcloud certificate-manager maps entries create ${n}-entry --map=tabornik-map --certificates=${n}-cert --hostname=${hostname}`,
  ].join("\n");
}

export default function ConnectionsPage() {
  const { t } = useTranslations();
  const confirm = useConfirm();
  const [hosts, setHosts] = useState<Host[]>([]);
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verify, setVerify] = useState<Record<string, Verify | "running">>({});
  const [commandsFor, setCommandsFor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () =>
    fetch("/api/public-hosts")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setHosts(data.hosts);
        setEvents(data.events);
      })
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  async function save(body: Form) {
    setBusy(true);
    setError(null);
    const res = await fetch(body.id ? `/api/public-hosts/${body.id}` : "/api/public-hosts", {
      method: body.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, eventId: body.eventId || null }),
    });
    setBusy(false);
    if (!res.ok) {
      const err = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "failed";
      setError(t(`connections.error_${err}`));
      return false;
    }
    await load();
    return true;
  }

  const toForm = (h: Host): Form => ({ id: h.id, hostname: h.hostname, purpose: h.purpose, eventId: h.eventId ?? "", isDefault: h.isDefault, active: h.active });

  async function toggleActive(h: Host) {
    const message = h.active ? t("connections.deactivateConfirm", { host: h.hostname }) : t("connections.activateConfirm", { host: h.hostname });
    if (!(await confirm({ message, danger: h.active, confirmLabel: h.active ? t("connections.deactivate") : t("connections.activate") }))) return;
    await save({ ...toForm(h), active: !h.active });
  }

  async function runVerify(id: string) {
    setVerify((v) => ({ ...v, [id]: "running" }));
    const res = await fetch(`/api/public-hosts/${id}/verify`, { method: "POST" });
    const data: Verify = res.ok ? await res.json() : { result: "page" };
    setVerify((v) => ({ ...v, [id]: data }));
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <h1 className="mb-1 text-[22px] font-semibold text-ink">{t("connections.title")}</h1>
      <p className="mb-6 text-[14px] text-ink-secondary">{t("connections.subtitle")}</p>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold text-ink">{t("connections.hostsTitle")}</h2>
          {!form && (
            <button type="button" onClick={() => { setError(null); setForm(EMPTY); }} className={linkBtn}>
              + {t("connections.add")}
            </button>
          )}
        </div>
        <p className="text-[13px] text-ink-secondary">{t("connections.hostsIntro")}</p>

        {form && (
          <div className="flex flex-col gap-3 rounded-lg border border-mist bg-paper p-4">
            <label className="text-[13px] text-ink-secondary">
              {t("connections.colHost")}
              <input value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })} placeholder="prihlasky.example.cz" className={inputClass + " mt-1"} />
            </label>
            <label className="text-[13px] text-ink-secondary">
              {t("connections.colPurpose")}
              <select value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value as Purpose, eventId: e.target.value === "registration" ? form.eventId : "" })} className={inputClass + " mt-1"}>
                {(Object.keys(PURPOSE_KEY) as Purpose[]).map((p) => (
                  <option key={p} value={p}>{t(PURPOSE_KEY[p])}</option>
                ))}
              </select>
            </label>
            {form.purpose === "registration" ? (
              <label className="text-[13px] text-ink-secondary">
                {t("connections.colEvent")}
                <select value={form.eventId} onChange={(e) => setForm({ ...form, eventId: e.target.value, isDefault: e.target.value ? false : form.isDefault })} className={inputClass + " mt-1"}>
                  <option value="">{t("connections.allEvents")}</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>{ev.name}</option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-[12px] text-ink-secondary">{t("connections.portalGlobalHint")}</p>
            )}
            <label className="flex items-center gap-2 text-[14px] text-ink">
              <input type="checkbox" checked={form.isDefault} disabled={!!form.eventId} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} className="h-4 w-4 accent-ember" />
              {t("connections.default")}
            </label>
            <span className="-mt-2 text-[11.5px] text-ink-secondary">{t("connections.defaultHint")}</span>
            {error && <p className="text-[13px] text-red-600">{error}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setForm(null)} className="text-[14px] text-ink-secondary hover:underline">{t("common.cancel")}</button>
              <button type="button" disabled={busy} onClick={async () => { if (await save(form)) setForm(null); }} className={btnPrimary}>{t("common.save")}</button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-mist">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-paper-2 text-ink-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">{t("connections.colHost")}</th>
                <th className="px-3 py-2 font-medium">{t("connections.colPurpose")}</th>
                <th className="px-3 py-2 font-medium">{t("connections.colEvent")}</th>
                <th className="px-3 py-2 font-medium">{t("connections.colDefault")}</th>
                <th className="px-3 py-2 font-medium">{t("connections.colActive")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {hosts.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-4 text-ink-secondary">{t("connections.empty")}</td></tr>
              )}
              {hosts.map((h) => {
                const v = verify[h.id];
                return (
                  <tr key={h.id} className={"border-t border-mist align-top" + (h.active ? "" : " opacity-60")}>
                    <td className="px-3 py-2 text-ink">
                      <span className="font-mono [overflow-wrap:anywhere]">{h.hostname}</span>
                      {v && (
                        <div className={"mt-1 text-[12px] " + (v !== "running" && v.result === "ok" ? "text-pine" : "text-ink-secondary")}>
                          {v === "running" ? t("connections.verifyRunning") : t(`connections.verify_${v.result}`) + (v.detail ? ` (${v.detail})` : "")}
                        </div>
                      )}
                      {commandsFor === h.id && (
                        <div className="mt-2">
                          <pre className="overflow-x-auto rounded bg-paper-2 p-2 text-[11.5px] text-ink">{gcloudCommands(h.hostname)}</pre>
                          <button type="button" className={linkBtn} onClick={() => { navigator.clipboard?.writeText(gcloudCommands(h.hostname)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}>
                            {copied ? t("connections.copied") : t("connections.copy")}
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink">{t(PURPOSE_KEY[h.purpose])}</td>
                    <td className="px-3 py-2 text-ink">{h.event?.name ?? (h.purpose === "registration" ? t("connections.allEvents") : "—")}</td>
                    <td className="px-3 py-2 text-ink">{h.isDefault ? t("connections.yes") : ""}</td>
                    <td className="px-3 py-2 text-ink">{h.active ? t("connections.yes") : t("connections.no")}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 whitespace-nowrap">
                        <button type="button" className={linkBtn} disabled={v === "running"} onClick={() => runVerify(h.id)}>{t("connections.verify")}</button>
                        <button type="button" className={linkBtn} onClick={() => setCommandsFor(commandsFor === h.id ? null : h.id)}>{t("connections.commands")}</button>
                        <button type="button" className={linkBtn} onClick={() => { setError(null); setForm(toForm(h)); }}>{t("connections.edit")}</button>
                        <button type="button" className={linkBtn} onClick={() => toggleActive(h)}>{h.active ? t("connections.deactivate") : t("connections.activate")}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!form && error && <p className="text-[13px] text-red-600">{error}</p>}
        <p className="text-[13px] text-ink-secondary">{t("connections.help")}</p>
      </section>
    </div>
  );
}
