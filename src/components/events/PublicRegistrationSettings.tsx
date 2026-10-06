"use client";

import { useState } from "react";
import { MarkdownEditor } from "@/components/registration/Markdown";

// Event settings -> "Registrace a členství" -> public page /r/<slug>
// (docs/registration-slice3-spec.md D): switch, slug, landing content
// (markdown: info, prices, rules). Off by default.
const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

export default function PublicRegistrationSettings({
  eventId,
  event,
  onSaved,
  t,
}: {
  eventId: string;
  event: { publicRegistration: boolean; publicSlug: string | null; landingContent: string | null };
  onSaved: () => void;
  t: (key: string, vars?: Record<string, string>) => string;
}) {
  const [on, setOn] = useState(event.publicRegistration);
  const [slug, setSlug] = useState(event.publicSlug ?? "");
  const [content, setContent] = useState(event.landingContent ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    if (on && !slug.trim()) return setMessage(t("publicSettings.slugRequired"));
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicRegistration: on, publicSlug: slug.trim() || null, landingContent: content }),
    });
    setSaving(false);
    const err = res.ok ? null : ((await res.json().catch(() => ({}))) as { error?: string }).error;
    setMessage(res.ok ? t("portalSettings.saved") : err === "slug_taken" ? t("publicSettings.slugTaken") : err === "bad_slug" ? t("publicSettings.slugInvalid") : t("registrationSettings.saveFailed"));
    if (res.ok) onSaved();
  }

  const url = slug.trim() && typeof window !== "undefined" ? `${window.location.origin}/r/${slug.trim()}` : null;

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <h4 className="text-[14px] font-semibold text-ink">{t("publicSettings.title")}</h4>
      <label className="flex items-center gap-2 text-[14px] text-ink">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="h-4 w-4 accent-ember" />
        {t("publicSettings.on")}
      </label>
      <span className="-mt-2 text-[11.5px] text-ink-secondary">{t("publicSettings.onHint")}</span>
      <label className="text-[13px] text-ink-secondary">
        {t("publicSettings.slug")}
        <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="clenstvi-2026" className={inputClass + " mt-1"} />
        {url && event.publicRegistration && event.publicSlug === slug.trim() && (
          <a href={url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-[12px] text-ember hover:underline">
            {url}
          </a>
        )}
      </label>
      <label className="text-[13px] text-ink-secondary">
        {t("publicSettings.landing")}
        <MarkdownEditor value={content} onChange={setContent} rows={8} className={inputClass + " font-mono text-[13px]"} t={t} />
        <span className="mt-1 block text-[11.5px]">{t("publicSettings.landingHint")}</span>
      </label>
      {message && <p className="text-[13px] text-ink">{message}</p>}
      <div className="flex justify-end">
        <button type="button" onClick={save} disabled={saving} className={btnPrimary}>
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}
