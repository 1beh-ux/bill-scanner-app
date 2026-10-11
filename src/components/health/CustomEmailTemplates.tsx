"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { useLevelUrl } from "@/lib/template-level";
import { useConfirm } from "@/components/ConfirmDialog";
import EmailTemplateAdmin from "@/components/health/EmailTemplateAdmin";

// "Vlastní e-maily": own named templates (e.g. "Pozvánka na akci") sent from Účastníci ->
// Poslat e-mail. Organization level: shared by every event. Event level: the organization's
// (each can be changed for the event) plus templates of this event only.
type Row = { purposeKey: string; name: string | null; eventOnly?: boolean };

const inputClass = "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const linkBtn = "text-[13px] text-ember hover:underline disabled:opacity-50";

export default function CustomEmailTemplates({ scope, eventId }: { scope: "org" | "event"; eventId?: string }) {
  const { t } = useTranslations();
  const lvl = useLevelUrl();
  const confirm = useConfirm();
  const listUrl = scope === "org" ? lvl("/api/email-templates/custom") : `/api/events/${eventId}/email-templates`;
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(listUrl)
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => {});
  }, [listUrl]);
  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setError(null);
    const res = await fetch(listUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    if (!res.ok) return setError(t("customEmails.createFailed"));
    const row = (await res.json()) as Row;
    setName(null);
    setOpen(row.purposeKey);
    load();
  }

  async function remove(r: Row) {
    if (!(await confirm({ message: t("customEmails.deleteConfirm", { name: r.name ?? "" }), danger: true }))) return;
    const sep = listUrl.includes("?") ? "&" : "?";
    await fetch(`${listUrl}${sep}purposeKey=${encodeURIComponent(r.purposeKey)}`, { method: "DELETE" });
    if (open === r.purposeKey) setOpen(null);
    load();
  }

  // At event level only the event's own templates are deleted here.
  const deletable = (r: Row) => scope === "org" || r.eventOnly;

  return (
    <section id="vlastni-emaily" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-ink">{t("customEmails.title")}</h3>
        {name === null && (
          <button type="button" className={linkBtn} onClick={() => setName("")}>
            + {t("customEmails.new")}
          </button>
        )}
      </div>
      <p className="text-[13px] text-ink-secondary">{t(scope === "org" ? "customEmails.hintOrg" : "customEmails.hintEvent")}</p>
      {name !== null && (
        <div className="flex max-w-md flex-col gap-2 rounded-lg border border-mist p-3">
          <label className="text-[13px] text-ink-secondary">
            {t("customEmails.name")}
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("customEmails.namePlaceholder")} className={inputClass + " mt-1"} />
          </label>
          {error && <p className="text-[13px] text-red-600">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" className="text-[13px] text-ink-secondary hover:underline" onClick={() => setName(null)}>{t("common.cancel")}</button>
            <button type="button" className={linkBtn} disabled={!name.trim()} onClick={create}>{t("customEmails.create")}</button>
          </div>
        </div>
      )}
      {rows.length === 0 && name === null && <p className="text-[13px] text-ink-secondary">{t("customEmails.empty")}</p>}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.purposeKey} className="rounded-lg border border-mist p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[14px] font-medium text-ink">
                {r.name}
                {r.eventOnly && <span className="ml-2 rounded-full bg-paper-2 px-2 py-0.5 text-[11px] text-ink-secondary">{t("customEmails.eventOnly")}</span>}
              </span>
              <span className="flex gap-3">
                <button type="button" className={linkBtn} onClick={() => setOpen(open === r.purposeKey ? null : r.purposeKey)}>
                  {open === r.purposeKey ? t("common.close") : t("common.edit")}
                </button>
                {deletable(r) && <button type="button" className={linkBtn} onClick={() => remove(r)}>{t("common.delete")}</button>}
              </span>
            </div>
            {open === r.purposeKey && (
              <div className="mt-3">
                <EmailTemplateAdmin scope={scope} eventId={eventId} purposeKey={r.purposeKey} label={r.name ?? ""} eventOnly={!!r.eventOnly} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
