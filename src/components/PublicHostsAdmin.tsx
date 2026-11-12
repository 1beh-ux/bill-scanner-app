"use client";

import HelpLink from "@/components/HelpLink";
import { Fragment, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import EmbedSnippetDialog, { portalSnippet } from "@/components/embed/EmbedSnippetDialog";

// "Veřejné adresy": hostnames that serve only the public registration page and/or
// the parent portal (docs/custom-domain.md). Two places (organizations step 3):
// app = Aplikace -> Veřejné adresy (super-admin): every organization's, add/edit;
// otherwise Organizace -> Připojení: the organization's own, read-only (+ Ověřit).
type Purpose = "registration" | "portal" | "both";
type Host = { id: string; hostname: string; purpose: Purpose; eventId: string | null; isDefault: boolean; active: boolean; organizationId: string; embedOrigins: string[]; embedPageUrl: string | null; event: { name: string } | null; organization?: { shortName: string } };
// embedOrigins: one origin per line in the form.
type Form = { id: string | null; hostname: string; purpose: Purpose; eventId: string; isDefault: boolean; active: boolean; organizationId: string; embedOrigins: string; embedPageUrl: string };
type OrgOption = { id: string; shortName: string };
type Verify = { result: "ok" | "dns" | "tls" | "page" | "no_lb_ip"; detail?: string };

const inputClass = "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const linkBtn = "text-[13px] text-ember hover:underline disabled:opacity-50";
const PURPOSE_KEY: Record<Purpose, string> = { registration: "connections.purposeRegistration", portal: "connections.purposePortal", both: "connections.purposeBoth" };

// The DNS target every public host points at (*.tabornik.online -> the load balancer, docs/custom-domain.md).
const CNAME_TARGET = "public.tabornik.online.";

/** The one-time Google Cloud setup for a new hostname (certificate + map entry in tabornik-map), commented. */
function gcloudCommands(hostname: string): string {
  const n = hostname.replace(/\./g, "-");
  return [
    `# 1) Ověření domény pro certifikát`,
    `gcloud certificate-manager dns-authorizations create ${n}-auth --domain=${hostname}`,
    `# 2) Vypíše záznam pro správce DNS: dnsResourceRecord -> name (_acme-challenge.${hostname}.) a data (…authorize.certificatemanager.goog.)`,
    `gcloud certificate-manager dns-authorizations describe ${n}-auth`,
    `# 3) Certifikát (ACTIVE až po přidání obou DNS záznamů, obvykle do hodiny)`,
    `gcloud certificate-manager certificates create ${n}-cert --domains=${hostname} --dns-authorizations=${n}-auth`,
    `# 4) Připojení k load balanceru`,
    `gcloud certificate-manager maps entries create ${n}-entry --map=tabornik-map --certificates=${n}-cert --hostname=${hostname}`,
    `# Stav certifikátu (čekejte na state: ACTIVE), pak v aplikaci "Ověřit"`,
    `gcloud certificate-manager certificates describe ${n}-cert --format="value(managed.state)"`,
  ].join("\n");
}

/** The domain's DNS zone (last two labels) and the record name relative to it; the apex can't be a CNAME. */
function dnsNames(hostname: string) {
  const parts = hostname.split(".");
  const zone = parts.slice(-2).join(".");
  const rel = parts.slice(0, -2).join(".");
  return { zone, rel, apex: rel === "" };
}

/** What the domain's DNS administrator adds: the certificate check record + the address itself. */
function dnsRecords(hostname: string, lbIp: string | null) {
  const { rel, apex } = dnsNames(hostname);
  const acme = `_acme-challenge${rel ? "." + rel : ""}`;
  return [
    { type: "CNAME", name: acme, fqdn: `_acme-challenge.${hostname}.`, value: "<data z kroku 2>" },
    apex
      ? { type: "A", name: "@", fqdn: `${hostname}.`, value: lbIp ?? "34.144.251.105" }
      : { type: "CNAME", name: rel, fqdn: `${hostname}.`, value: CNAME_TARGET },
  ];
}

function dnsMessage(hostname: string, lbIp: string | null, t: (key: string, vars?: Record<string, string>) => string): string {
  const { zone } = dnsNames(hostname);
  const lines = dnsRecords(hostname, lbIp).map((r) => `${r.type}  ${r.fqdn}  ->  ${r.value}`);
  return [t("connections.dnsMailIntro", { host: hostname, zone }), "", ...lines, "", t("connections.dnsMailOutro")].join("\n");
}

export default function PublicHostsAdmin({ app }: { app: boolean }) {
  const { t, organization } = useTranslations();
  const confirm = useConfirm();
  const [hosts, setHosts] = useState<Host[]>([]);
  const [events, setEvents] = useState<{ id: string; name: string; organizationId: string }[]>([]);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verify, setVerify] = useState<Record<string, Verify | "running">>({});
  const [commandsFor, setCommandsFor] = useState<string | null>(null);
  // Only on the app page, and only when the server agrees (super-admin).
  const [canEdit, setCanEdit] = useState(false);
  const [lbIp, setLbIp] = useState<string | null>(null);
  const [snippetFor, setSnippetFor] = useState<Host | null>(null);

  const load = () =>
    fetch(app ? "/api/public-hosts?all=1" : "/api/public-hosts")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setHosts(data.hosts);
        setEvents(data.events);
        setOrgs(data.organizations ?? []);
        setCanEdit(app && data.canEdit === true);
        setLbIp(data.lbIp ?? null);
      })
      .catch(() => {});

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app]);

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

  const toForm = (h: Host): Form => ({ id: h.id, hostname: h.hostname, purpose: h.purpose, eventId: h.eventId ?? "", isDefault: h.isDefault, active: h.active, organizationId: h.organizationId, embedOrigins: h.embedOrigins.join("\n"), embedPageUrl: h.embedPageUrl ?? "" });
  const empty = (): Form => ({ id: null, hostname: "", purpose: "registration", eventId: "", isDefault: false, active: true, organizationId: organization?.id ?? orgs[0]?.id ?? "", embedOrigins: "", embedPageUrl: "" });

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
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold text-ink">{t("connections.hostsTitle")} <HelpLink slug="verejne-adresy" /></h2>
          {!form && canEdit && (
            <button type="button" onClick={() => { setError(null); setForm(empty()); }} className={linkBtn}>
              + {t("connections.add")}
            </button>
          )}
        </div>
        <p className="text-[13px] text-ink-secondary">{t("connections.hostsIntro")}</p>

        {form && (
          <div className="flex flex-col gap-3 rounded-lg border border-mist bg-paper p-4">
            <label className="text-[13px] text-ink-secondary">
              {t("connections.colOrganization")}
              {/* A host tied to an event must stay in that event's organization: changing it drops the event. */}
              <select value={form.organizationId} onChange={(e) => setForm({ ...form, organizationId: e.target.value, eventId: "" })} className={inputClass + " mt-1"}>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.shortName}</option>
                ))}
              </select>
            </label>
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
                  {events.filter((ev) => ev.organizationId === form.organizationId).map((ev) => (
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
            <label className="text-[13px] text-ink-secondary">
              {t("embed.originsLabel")}
              <textarea rows={3} value={form.embedOrigins} onChange={(e) => setForm({ ...form, embedOrigins: e.target.value })} placeholder="https://www.example.cz" className={inputClass + " mt-1 font-mono"} />
              <span className="mt-1 block text-[11.5px]">{t("embed.originsHelp")}</span>
            </label>
            {form.purpose !== "registration" && (
              <label className="text-[13px] text-ink-secondary">
                {t("embed.pageLabel")}
                <input value={form.embedPageUrl} onChange={(e) => setForm({ ...form, embedPageUrl: e.target.value })} placeholder="https://www.example.cz/rodicovsky-portal" className={inputClass + " mt-1"} />
                <span className="mt-1 block text-[11.5px]">{t("embed.pageHelp")}</span>
              </label>
            )}
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
                {app && <th className="px-3 py-2 font-medium">{t("connections.colOrganization")}</th>}
                <th className="px-3 py-2 font-medium">{t("connections.colPurpose")}</th>
                <th className="px-3 py-2 font-medium">{t("connections.colEvent")}</th>
                <th className="px-3 py-2 font-medium">{t("connections.colDefault")}</th>
                <th className="px-3 py-2 font-medium">{t("connections.colActive")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {hosts.length === 0 && (
                <tr><td colSpan={app ? 7 : 6} className="px-3 py-4 text-ink-secondary">{t("connections.empty")}</td></tr>
              )}
              {hosts.map((h) => {
                const v = verify[h.id];
                return (
                  <Fragment key={h.id}>
                  <tr className={"border-t border-mist align-top" + (h.active ? "" : " opacity-60")}>
                    <td className="px-3 py-2 text-ink">
                      <span className="font-mono [overflow-wrap:anywhere]">{h.hostname}</span>
                      {v && (
                        <div className={"mt-1 text-[12px] " + (v !== "running" && v.result === "ok" ? "text-pine" : "text-ink-secondary")}>
                          {v === "running" ? t("connections.verifyRunning") : t(`connections.verify_${v.result}`) + (v.detail ? ` (${v.detail})` : "")}
                        </div>
                      )}
                      <div className="mt-1 text-[12px] text-ink-secondary [overflow-wrap:anywhere]">
                        {t("embed.originsShort")}: {h.embedOrigins.length ? h.embedOrigins.join(", ") : t("embed.nobody")}
                        {h.purpose !== "registration" && h.embedPageUrl && <><br />{t("embed.pageShort")}: {h.embedPageUrl}</>}
                      </div>
                    </td>
                    {app && <td className="px-3 py-2 text-ink">{h.organization?.shortName}</td>}
                    <td className="px-3 py-2 text-ink">{t(PURPOSE_KEY[h.purpose])}</td>
                    <td className="px-3 py-2 text-ink">{h.event?.name ?? (h.purpose === "registration" ? t("connections.allEvents") : "—")}</td>
                    <td className="px-3 py-2 text-ink">{h.isDefault ? t("connections.yes") : ""}</td>
                    <td className="px-3 py-2 text-ink">{h.active ? t("connections.yes") : t("connections.no")}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 whitespace-nowrap">
                        <button type="button" className={linkBtn} disabled={v === "running"} onClick={() => runVerify(h.id)}>{t("connections.verify")}</button>
                        {h.purpose !== "registration" && h.active && <button type="button" className={linkBtn} onClick={() => setSnippetFor(h)}>{t("embed.portalButton")}</button>}
                        {canEdit && (
                          <>
                            <button type="button" className={linkBtn} onClick={() => setCommandsFor(commandsFor === h.id ? null : h.id)}>{t("connections.commands")}</button>
                            <button type="button" className={linkBtn} onClick={() => { setError(null); setForm(toForm(h)); }}>{t("connections.edit")}</button>
                            <button type="button" className={linkBtn} onClick={() => toggleActive(h)}>{h.active ? t("connections.deactivate") : t("connections.activate")}</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {commandsFor === h.id && (
                    <tr className="border-t border-mist/60 bg-paper-2/40">
                      {/* Full table width, wrapping: the columns never get pushed off-screen. */}
                      <td colSpan={app ? 7 : 6} className="max-w-0 px-3 py-3">
                        <SetupPanel hostname={h.hostname} lbIp={lbIp} t={t} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {snippetFor && (
          <EmbedSnippetDialog
            title={t("embed.portalButton")}
            snippet={portalSnippet(`https://${snippetFor.hostname}`)}
            previewUrl={`https://${snippetFor.hostname}/?embed=1`}
            origins={snippetFor.embedOrigins}
            onClose={() => setSnippetFor(null)}
            t={t}
          />
        )}
        {!form && error && <p className="text-[13px] text-red-600">{error}</p>}
        <p className="text-[13px] text-ink-secondary">{t(app ? "connections.help" : "connections.helpReadOnly")}</p>
      </section>
  );
}

function CopyButton({ text, t }: { text: string; t: (key: string, vars?: Record<string, string>) => string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className={linkBtn} onClick={() => navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {})}>
      {copied ? t("connections.copied") : t("connections.copy")}
    </button>
  );
}

const pre = "whitespace-pre-wrap [overflow-wrap:anywhere] rounded bg-paper-2 p-2 font-mono text-[11.5px] text-ink";

/** "Příkazy": who does what, in order -- Google Cloud (super-admin), DNS (the domain's administrator), Ověřit. */
function SetupPanel({ hostname, lbIp, t }: { hostname: string; lbIp: string | null; t: (key: string, vars?: Record<string, string>) => string }) {
  const { zone, apex } = dnsNames(hostname);
  const records = dnsRecords(hostname, lbIp);
  const commands = gcloudCommands(hostname);
  const message = dnsMessage(hostname, lbIp, t);
  return (
    <div className="flex flex-col gap-4 text-[13px] text-ink">
      <section className="flex flex-col gap-1.5">
        <h4 className="font-semibold">{t("connections.setupGcpTitle")}</h4>
        <p className="text-ink-secondary">{t("connections.setupGcpText")}</p>
        <pre className={pre}>{commands}</pre>
        <div><CopyButton text={commands} t={t} /></div>
      </section>
      <section className="flex flex-col gap-1.5">
        <h4 className="font-semibold">{t("connections.setupDnsTitle", { zone })}</h4>
        <p className="text-ink-secondary">{t("connections.setupDnsText", { zone })}</p>
        <table className="w-full table-fixed border-collapse text-[12px]">
          <thead className="text-left text-ink-secondary">
            <tr>
              <th className="w-[70px] py-1 pr-2 font-medium">{t("connections.dnsType")}</th>
              <th className="py-1 pr-2 font-medium">{t("connections.dnsName", { zone })}</th>
              <th className="py-1 font-medium">{t("connections.dnsValue")}</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {records.map((r) => (
              <tr key={r.fqdn} className="border-t border-mist/60 align-top">
                <td className="py-1 pr-2">{r.type}</td>
                <td className="py-1 pr-2 [overflow-wrap:anywhere]">{r.name}<div className="font-sans text-[11px] text-ink-secondary">{r.fqdn}</div></td>
                <td className="py-1 [overflow-wrap:anywhere]">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="list-disc pl-5 text-[12px] text-ink-secondary">
          <li>{t("connections.dnsAcmeNote")}</li>
          <li>{apex ? t("connections.dnsApexNote", { ip: lbIp ?? "34.144.251.105" }) : t("connections.dnsCnameNote")}</li>
        </ul>
        <p className="mt-1 text-ink-secondary">{t("connections.dnsMailLabel")}</p>
        <pre className={pre}>{message}</pre>
        <div><CopyButton text={message} t={t} /></div>
      </section>
      <section className="flex flex-col gap-1">
        <h4 className="font-semibold">{t("connections.setupVerifyTitle")}</h4>
        <p className="text-ink-secondary">{t("connections.setupVerifyText")}</p>
      </section>
    </div>
  );
}
