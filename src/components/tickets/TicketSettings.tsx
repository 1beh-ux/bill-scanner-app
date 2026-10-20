"use client";

import { useEffect, useState } from "react";
import EmailTemplateAdmin from "@/components/health/EmailTemplateAdmin";
import { MAX_PER_ORDER_LIMIT, orderVs, type TicketSettings as Settings, type TicketType } from "@/lib/tickets";
import { TICKET_CANCEL_PURPOSE_KEY, TICKET_DOCUMENT_PURPOSE_KEY, TICKET_ORDER_PURPOSE_KEY, TICKET_SEND_PURPOSE_KEY } from "@/lib/email-template-purpose-keys";

// Nastavení akce -> Vstupenky (public events, docs/public-event-tickets-spec.md): price types with
// limits, order limits, VS, sales end, payment account + Fio check, the portal, the door link and
// the four templates (three e-mails + the ticket page itself).
type T = (key: string, vars?: Record<string, string>) => string;
type View = {
  types: TicketType[];
  settings: Settings;
  registrationDeadline: string;
  location: string;
  portalInfo: string;
  accountNumber: string;
  bankCode: string;
  bankCheckEnabled: boolean;
  bankAccountId: string | null;
  portalOpen: boolean;
  senderEmail: string | null;
  scanLink: string | null;
};
type Row = { key: string; label: string; priceCzk: string; capacity: string };

const inputClass = "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const btn = "rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2 disabled:opacity-50";
const h3 = "mb-2 text-[15px] font-semibold text-ink";
const label = "text-[13px] text-ink-secondary";
const norm = (s: string) => s.replace(/\s/g, "");
const num = (s: string) => (s.trim() === "" ? null : Number(s));

export default function TicketSettings({ eventId, isAdmin, t }: { eventId: string; isAdmin: boolean; t: T }) {
  const [view, setView] = useState<View | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [form, setForm] = useState({ maxPerOrder: "10", totalCapacity: "", vsPrefix: "", registrationDeadline: "", location: "", portalInfo: "", accountNumber: "", bankCode: "", bankCheckEnabled: false, bankAccountId: "", portalOpen: false });
  const [bankAccounts, setBankAccounts] = useState<{ id: string; label: string; accountNumber: string; bankCode: string; tokenSetAt: string | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [docLink, setDocLink] = useState("");

  function apply(v: View) {
    setView(v);
    setDocLink(v.settings.docTemplate ? `https://docs.google.com/document/d/${v.settings.docTemplate}/edit` : "");
    setRows(v.types.length ? v.types.map((x) => ({ key: x.key, label: x.label, priceCzk: String(x.priceCzk), capacity: x.capacity ? String(x.capacity) : "" })) : [{ key: "", label: t("ticketSettings.defaultType"), priceCzk: "", capacity: "" }]);
    setForm({
      maxPerOrder: String(v.settings.maxPerOrder),
      totalCapacity: v.settings.totalCapacity ? String(v.settings.totalCapacity) : "",
      vsPrefix: v.settings.vsPrefix,
      registrationDeadline: v.registrationDeadline,
      location: v.location,
      portalInfo: v.portalInfo,
      accountNumber: v.accountNumber,
      bankCode: v.bankCode,
      bankCheckEnabled: v.bankCheckEnabled,
      bankAccountId: v.bankAccountId ?? "",
      portalOpen: v.portalOpen,
    });
  }

  useEffect(() => {
    fetch(`/api/events/${eventId}/tickets/settings`)
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => v && apply(v))
      .catch(() => {});
    fetch("/api/bank-accounts")
      .then((r) => (r.ok ? r.json() : { accounts: [] }))
      .then((d) => setBankAccounts(d.accounts ?? []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Only the organization's connected Fio accounts equal to the payment account qualify.
  const matching = bankAccounts.filter((a) => a.tokenSetAt && a.accountNumber === norm(form.accountNumber) && a.bankCode === norm(form.bankCode));
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function patch(body: object) {
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/events/${eventId}/tickets/settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage({ ok: false, text: t(`ticketSettings.error.${data.error ?? "failed"}`, { name: data.name ?? "" }) });
    apply(data);
    setMessage({ ok: true, text: t("ticketSettings.saved") });
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    patch({
      types: rows.map((r) => ({ key: r.key, label: r.label, priceCzk: num(r.priceCzk), capacity: num(r.capacity) })),
      maxPerOrder: num(form.maxPerOrder),
      totalCapacity: num(form.totalCapacity),
      vsPrefix: form.vsPrefix.trim(),
      registrationDeadline: form.registrationDeadline,
      location: form.location,
      portalInfo: form.portalInfo,
      accountNumber: form.accountNumber,
      bankCode: form.bankCode,
      bankCheckEnabled: form.bankCheckEnabled && !!form.bankAccountId,
      bankAccountId: form.bankAccountId || null,
      portalOpen: form.portalOpen,
    });
  }

  async function preview() {
    const res = await fetch(`/api/events/${eventId}/tickets/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (!res.ok) return setMessage({ ok: false, text: t("ticketSettings.previewFailed") });
    window.open(URL.createObjectURL(await res.blob()), "_blank");
  }

  if (!view) return <p className="text-[13px] text-ink-secondary">{t("common.loading")}</p>;

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      {!view.senderEmail && <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{t("ticketSettings.noSender")}</p>}

      <form onSubmit={save} className="flex flex-col gap-6">
        <section>
          <h3 className={h3}>{t("ticketSettings.typesTitle")}</h3>
          <p className="mb-2 text-[12px] text-ink-secondary">{t("ticketSettings.typesHint")}</p>
          <div className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
                <label className={label}>
                  {i === 0 && t("ticketSettings.typeLabel")}
                  <input value={r.label} onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} disabled={!isAdmin} className={inputClass + " mt-1"} />
                </label>
                <label className={label}>
                  {i === 0 && t("ticketSettings.typePrice")}
                  <input type="number" min={0} value={r.priceCzk} onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, priceCzk: e.target.value } : x)))} disabled={!isAdmin} className={inputClass + " mt-1"} />
                </label>
                <label className={label}>
                  {i === 0 && t("ticketSettings.typeCapacity")}
                  <input type="number" min={1} value={r.capacity} placeholder={t("ticketSettings.unlimited")} onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, capacity: e.target.value } : x)))} disabled={!isAdmin} className={inputClass + " mt-1"} />
                </label>
                <button type="button" onClick={() => setRows((p) => p.filter((_, j) => j !== i))} disabled={!isAdmin || rows.length === 1} className={btn + " mb-0.5"} aria-label={t("ticketSettings.removeType")}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          {isAdmin && (
            <button type="button" onClick={() => setRows((p) => [...p, { key: "", label: "", priceCzk: "", capacity: "" }])} className={btn + " mt-2"}>
              {t("ticketSettings.addType")}
            </button>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <label className={label}>
            {t("ticketSettings.maxPerOrder")}
            <input type="number" min={1} max={MAX_PER_ORDER_LIMIT} value={form.maxPerOrder} onChange={(e) => set({ maxPerOrder: e.target.value })} disabled={!isAdmin} className={inputClass + " mt-1"} />
          </label>
          <label className={label}>
            {t("ticketSettings.totalCapacity")}
            <input type="number" min={1} value={form.totalCapacity} placeholder={t("ticketSettings.unlimited")} onChange={(e) => set({ totalCapacity: e.target.value })} disabled={!isAdmin} className={inputClass + " mt-1"} />
          </label>
          <label className={label}>
            {t("ticketSettings.salesEnd")}
            <input type="date" value={form.registrationDeadline} onChange={(e) => set({ registrationDeadline: e.target.value })} disabled={!isAdmin} className={inputClass + " mt-1"} />
          </label>
          <label className={label + " sm:col-span-3"}>
            {t("ticketSettings.location")}
            <input value={form.location} onChange={(e) => set({ location: e.target.value })} disabled={!isAdmin} className={inputClass + " mt-1"} />
          </label>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className={h3}>{t("ticketSettings.paymentTitle")}</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={label + " sm:col-span-2"}>
              {t("feeSettings.bankAccountLabel")}
              <input value={form.accountNumber} onChange={(e) => set({ accountNumber: e.target.value })} disabled={!isAdmin} className={inputClass + " mt-1"} />
            </label>
            <label className={label}>
              {t("feeSettings.bankCodeLabel")}
              <input value={form.bankCode} onChange={(e) => set({ bankCode: e.target.value })} disabled={!isAdmin} className={inputClass + " mt-1"} />
            </label>
            <label className={label}>
              {t("ticketSettings.vsPrefix")}
              <input value={form.vsPrefix} onChange={(e) => set({ vsPrefix: e.target.value.replace(/\D/g, "").slice(0, 6) })} disabled={!isAdmin} className={inputClass + " mt-1"} />
            </label>
            <p className="self-end pb-2 text-[12px] text-ink-secondary sm:col-span-2">{t("ticketSettings.vsPreview", { a: orderVs(form.vsPrefix || "0", 1), b: orderVs(form.vsPrefix || "0", 2) })}</p>
          </div>
          <label className="flex items-center gap-2 text-[14px] text-ink">
            <input type="checkbox" checked={form.bankCheckEnabled} onChange={(e) => set({ bankCheckEnabled: e.target.checked })} disabled={!isAdmin || !matching.length} className="h-4 w-4 accent-ember" />
            {t("ticketSettings.bankCheck")}
          </label>
          {matching.length > 0 ? (
            form.bankCheckEnabled && (
              <select value={form.bankAccountId} onChange={(e) => set({ bankAccountId: e.target.value })} disabled={!isAdmin} className={inputClass}>
                <option value="">{t("bankCheck.pickAccount")}</option>
                {matching.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} ({a.accountNumber}/{a.bankCode})
                  </option>
                ))}
              </select>
            )
          ) : (
            <span className="text-[12px] text-ink-secondary">{t("bankCheck.noMatchingAccount")}</span>
          )}
          <p className="text-[12px] text-ink-secondary">{t("ticketSettings.bankCheckHint")}</p>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className={h3}>{t("ticketSettings.portalTitle")}</h3>
          <label className="flex items-center gap-2 text-[14px] text-ink">
            <input type="checkbox" checked={form.portalOpen} onChange={(e) => set({ portalOpen: e.target.checked })} disabled={!isAdmin} className="h-4 w-4 accent-ember" />
            {t("ticketSettings.portalOpen")}
          </label>
          <label className={label}>
            {t("ticketSettings.portalInfo")}
            <textarea rows={3} value={form.portalInfo} onChange={(e) => set({ portalInfo: e.target.value })} disabled={!isAdmin} className={inputClass + " mt-1"} />
          </label>
          <p className="text-[12px] text-ink-secondary">{t("ticketSettings.publicPageHint")}</p>
        </section>

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={saving} className={btnPrimary}>
              {t("common.save")}
            </button>
            {message && <span className={"text-[13px] " + (message.ok ? "text-pine" : "text-red-600")}>{message.text}</span>}
          </div>
        )}
      </form>

      <section className="flex flex-col gap-2">
        <h3 className={h3}>{t("ticketSettings.scanTitle")}</h3>
        <p className="text-[12px] text-ink-secondary">{t("ticketSettings.scanHint")}</p>
        {view.scanLink ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-paper-2 px-2 py-1 text-[12px]">{view.scanLink}</code>
            <button type="button" className={btn} onClick={() => navigator.clipboard?.writeText(view.scanLink!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {})}>
              {copied ? t("ticketSettings.copied") : t("ticketSettings.copy")}
            </button>
            {isAdmin && (
              <>
                <button type="button" className={btn} disabled={saving} onClick={() => patch({ scanLink: "new" })}>{t("ticketSettings.scanNew")}</button>
                <button type="button" className={btn} disabled={saving} onClick={() => patch({ scanLink: "revoke" })}>{t("ticketSettings.scanRevoke")}</button>
              </>
            )}
          </div>
        ) : (
          isAdmin && <button type="button" className={btn + " self-start"} disabled={saving} onClick={() => patch({ scanLink: "new" })}>{t("ticketSettings.scanCreate")}</button>
        )}
      </section>

      <section className="flex flex-col gap-6">
        <h3 className={h3}>{t("ticketSettings.templatesTitle")}</h3>
        <EmailTemplateAdmin scope="event" eventId={eventId} purposeKey={TICKET_ORDER_PURPOSE_KEY} label={t("ticketSettings.tplOrder")} />
        <EmailTemplateAdmin scope="event" eventId={eventId} purposeKey={TICKET_SEND_PURPOSE_KEY} label={t("ticketSettings.tplSend")} />
        <EmailTemplateAdmin scope="event" eventId={eventId} purposeKey={TICKET_CANCEL_PURPOSE_KEY} label={t("ticketSettings.tplCancel")} />
        <div>
          <p className="mb-2 text-[12px] text-ink-secondary">{t("ticketSettings.tplTicketHint")}</p>
          {/* Google Doc template (logo, fonts, design) wins over the text one when set. */}
          <label className={label}>
            {t("ticketSettings.docTemplate")}
            <div className="mt-1 flex gap-2">
              <input value={docLink} onChange={(e) => setDocLink(e.target.value)} disabled={!isAdmin} placeholder="https://docs.google.com/document/d/…" className={inputClass} />
              {isAdmin && (
                <button type="button" onClick={() => patch({ docTemplate: docLink })} disabled={saving} className={btn}>
                  {t("common.save")}
                </button>
              )}
            </div>
          </label>
          <p className="mb-3 mt-1 text-[12px] text-ink-secondary">{t("ticketSettings.docTemplateHint")}</p>
          {!view.settings.docTemplate && <EmailTemplateAdmin scope="event" eventId={eventId} purposeKey={TICKET_DOCUMENT_PURPOSE_KEY} label={t("ticketSettings.tplTicket")} bodyOnly />}
          <button type="button" onClick={preview} className={btn + " mt-2"}>
            {t("ticketSettings.previewPdf")}
          </button>
        </div>
      </section>
    </div>
  );
}
