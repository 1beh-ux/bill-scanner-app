"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "@/lib/i18n";

const VARIABLES = ["child_name", "camp_name", "date_range", "sender_name"] as const;

const DUMMY_VALUES: Record<(typeof VARIABLES)[number], string> = {
  child_name: "Anna Nováková",
  camp_name: "Letní tábor 2026",
  date_range: "1.–7. 8. 2026",
  sender_name: "Zdravotník",
};

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const varBtnClass =
  "rounded-full border border-mist bg-paper-2 px-2.5 py-1 text-[12px] text-ink-secondary hover:bg-mist";

function substitute(text: string): string {
  let out = text;
  for (const key of VARIABLES) {
    out = out.replaceAll(`{{${key}}}`, DUMMY_VALUES[key]);
  }
  return out;
}

interface EmailTemplateAdminProps {
  scope: "org" | "event";
  eventId?: string;
  label: string;
}

export default function EmailTemplateAdmin({ scope, eventId, label }: EmailTemplateAdminProps) {
  const { t } = useTranslations();
  const url = scope === "org" ? "/api/email-templates" : `/api/events/${eventId}/email-template`;

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [hasOverride, setHasOverride] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const activeFieldRef = useRef<"subject" | "body">("body");

  async function load() {
    setLoading(true);
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setSubject(data.subject);
      setBody(data.body);
      setHasOverride(Boolean(data.hasOverride));
    } else {
      setError(t("emailTemplateAdmin.errorLoadFailed"));
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, eventId]);

  function insertVariable(name: string) {
    const token = `{{${name}}}`;
    if (activeFieldRef.current === "subject") {
      const el = subjectRef.current;
      const start = el?.selectionStart ?? subject.length;
      const end = el?.selectionEnd ?? subject.length;
      const next = subject.slice(0, start) + token + subject.slice(end);
      setSubject(next);
      requestAnimationFrame(() => el?.setSelectionRange(start + token.length, start + token.length));
    } else {
      const el = bodyRef.current;
      const start = el?.selectionStart ?? body.length;
      const end = el?.selectionEnd ?? body.length;
      const next = body.slice(0, start) + token + body.slice(end);
      setBody(next);
      requestAnimationFrame(() => el?.setSelectionRange(start + token.length, start + token.length));
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(t("emailTemplateAdmin.errorSaveFailed"));
      return;
    }
    setHasOverride(true);
  }

  async function handleRevert() {
    setSaving(true);
    setError(null);
    const res = await fetch(url, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) {
      setError(t("emailTemplateAdmin.errorSaveFailed"));
      return;
    }
    const data = await res.json();
    setSubject(data.subject);
    setBody(data.body);
    setHasOverride(false);
  }

  if (loading) {
    return <p className="text-[13px] text-ink-secondary">{t("common.loading")}</p>;
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-ink">{label}</h3>
        {scope === "event" && hasOverride && (
          <button onClick={handleRevert} disabled={saving} className="text-[13px] text-ink-secondary hover:text-ink disabled:opacity-50">
            {t("emailTemplateAdmin.revertToDefault")}
          </button>
        )}
      </div>

      {scope === "event" && !hasOverride && (
        <p className="mb-3 text-[13px] text-ink-secondary">{t("emailTemplateAdmin.usingOrgDefault")}</p>
      )}

      {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}

      <div className="mb-2 flex flex-wrap gap-1.5">
        {VARIABLES.map((name) => (
          <button key={name} type="button" onClick={() => insertVariable(name)} className={varBtnClass}>
            {`{{${name}}}`}
          </button>
        ))}
      </div>

      <label className="mb-1 block text-[12px] text-ink-secondary">{t("emailTemplateAdmin.subjectLabel")}</label>
      <input
        ref={subjectRef}
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        onFocus={() => (activeFieldRef.current = "subject")}
        className={inputClass + " mb-3"}
      />

      <label className="mb-1 block text-[12px] text-ink-secondary">{t("emailTemplateAdmin.bodyLabel")}</label>
      <textarea
        ref={bodyRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onFocus={() => (activeFieldRef.current = "body")}
        rows={6}
        className={inputClass + " mb-3"}
      />

      <div className="mb-4 rounded-lg border border-mist bg-paper-2 p-3">
        <p className="mb-1 text-[11px] uppercase tracking-wide text-ink-secondary">
          {t("emailTemplateAdmin.previewTitle")}
        </p>
        <p className="mb-2 text-[14px] font-medium text-ink">{substitute(subject)}</p>
        <p className="whitespace-pre-wrap text-[13px] text-ink-secondary">{substitute(body)}</p>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className={btnPrimary}>
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}
