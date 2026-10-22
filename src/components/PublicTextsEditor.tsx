"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { PUBLIC_TEXT_MAX } from "@/lib/public-texts";

// Texty veřejných stránek (src/lib/public-texts.ts): every text of the registration form (public.*) and
// the parent portal (portal.*), searchable, with its default always shown under the field.
// Organizace -> Vzhled (no eventId): the organization's wording; Nastavení akce -> Veřejná přihláška
// (eventId): this event's own on its page, over the organization's.
type Row = { key: string; cs: string };
type View = { defaults: Row[]; texts: Record<string, string>; orgTexts?: Record<string, string> };
const inputClass = "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const chip = (on: boolean) => "rounded-full px-3 py-1 text-[13px] " + (on ? "bg-ember text-white" : "bg-paper-2 text-ink hover:bg-mist");

export default function PublicTextsEditor({ eventId }: { eventId?: string }) {
  const { t } = useTranslations();
  const url = eventId ? `/api/events/${eventId}/public-texts` : "/api/organizations/public-texts";
  const [view, setView] = useState<View | null>(null);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [part, setPart] = useState<"all" | "public." | "portal." | "changed">("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function take(v: View) {
    setView(v);
    setTexts(v.texts);
  }
  useEffect(() => {
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => v && take(v))
      .catch(() => {});
  }, [url]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (view?.defaults ?? []).filter(
      (r) =>
        (part === "all" || (part === "changed" ? !!texts[r.key]?.trim() : r.key.startsWith(part))) &&
        (!q || r.key.toLowerCase().includes(q) || r.cs.toLowerCase().includes(q) || (texts[r.key] ?? "").toLowerCase().includes(q))
    );
  }, [view, texts, query, part]);

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texts }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) take(await res.json());
    setMessage(t(res?.ok ? "appearance.saved" : "appearance.failed"));
  }

  if (!view) return null;
  const changed = Object.values(texts).filter((v) => v.trim()).length;

  return (
    <section className={eventId ? "" : "mx-auto max-w-5xl px-4 pb-10 md:px-8"}>
      <h2 className="mb-1 text-[16px] font-semibold text-ink">{t(eventId ? "publicTexts.eventTitle" : "publicTexts.title")}</h2>
      <p className="mb-3 max-w-3xl text-[13px] text-ink-secondary">{t(eventId ? "publicTexts.eventHint" : "publicTexts.hint")}</p>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2">
          {t("publicTexts.open")}
          {changed > 0 && ` (${t("publicTexts.changedCount", { n: String(changed) })})`}
        </button>
      ) : (
        <div className="flex max-w-3xl flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "public.", "portal.", "changed"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setPart(k)} className={chip(part === k)}>
                {t(`publicTexts.part.${k === "public." ? "form" : k === "portal." ? "portal" : k}`)}
                {k === "changed" && ` (${changed})`}
              </button>
            ))}
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("publicTexts.search")} className="ml-auto w-64 rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px]" />
          </div>
          {shown.length === 0 && <p className="text-[13px] text-ink-secondary">{t("publicTexts.none")}</p>}
          {shown.map((r) => {
            const org = view.orgTexts?.[r.key];
            const value = texts[r.key] ?? "";
            const long = (org ?? r.cs).length > 70;
            const props = {
              value,
              onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setTexts((x) => ({ ...x, [r.key]: e.target.value })),
              placeholder: org ?? r.cs,
              maxLength: PUBLIC_TEXT_MAX,
              className: inputClass,
            };
            return (
              <div key={r.key} className={value.trim() ? "rounded-lg border border-ember/40 p-2" : ""}>
                {long ? <textarea rows={3} {...props} /> : <input {...props} />}
                {/* The default stays readable while typing (the placeholder disappears). */}
                <p className="mt-0.5 text-[11.5px] text-ink-secondary">
                  {t("ticketSettings.textDefault", { text: r.cs })}
                  {org && ` · ${t("publicTexts.orgValue", { text: org })}`}
                  <span className="ml-1.5 font-mono text-[10.5px] opacity-70">{r.key}</span>
                </p>
              </div>
            );
          })}
          {message && <p className="text-[13px] text-ink">{message}</p>}
          <div className="sticky bottom-0 flex justify-end gap-3 bg-paper py-2">
            <button type="button" onClick={() => setOpen(false)} className="text-[14px] text-ink-secondary hover:underline">
              {t("common.close")}
            </button>
            <button type="button" onClick={save} disabled={busy} className={btnPrimary}>
              {t("common.save")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
