"use client";

import { useLevelUrl } from "@/lib/template-level";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { templateVariablesFor, substituteDummyTemplateValues } from "@/lib/email-template-preview";
import { PARENT_SUMMARY_PURPOSE_KEY } from "@/lib/email-template-purpose-keys";
import { MarkdownEditor, MarkdownText } from "@/components/registration/Markdown";
import TemplateAttachments from "@/components/health/TemplateAttachments";
import { ADULT_CONDITION, docConditionKey, readVariants, writeVariants, type Variants } from "@/lib/email-conditions";
import EmailFiles from "@/components/health/EmailFiles";
import { takesAttachments } from "@/lib/email-attachments";

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const varBtnClass =
  "rounded-full border border-mist bg-paper-2 px-2.5 py-1 text-[12px] text-ink-secondary hover:bg-mist";

interface EmailTemplateAdminProps {
  scope: "org" | "event";
  eventId?: string;
  label: string;
  purposeKey?: string;
  // The Pošta reply keeps "Re: <their subject>" -- only the body is a template.
  bodyOnly?: boolean;
  // An own template of this event only: no organization default to compare with or revert to.
  eventOnly?: boolean;
}

export default function EmailTemplateAdmin({
  scope,
  eventId,
  label,
  purposeKey = PARENT_SUMMARY_PURPOSE_KEY,
  bodyOnly = false,
  eventOnly = false,
}: EmailTemplateAdminProps) {
  const { t } = useTranslations();
  // Org scope: the organization's template, or the app's on Aplikace -> Šablony aplikace (?level=app).
  const lvl = useLevelUrl();
  const baseUrl = scope === "org" ? "/api/email-templates" : `/api/events/${eventId}/email-template`;
  const url = scope === "org" ? lvl(`${baseUrl}?purposeKey=${encodeURIComponent(purposeKey)}`) : `${baseUrl}?purposeKey=${encodeURIComponent(purposeKey)}`;
  const purposeVariables = templateVariablesFor(purposeKey);

  // Every participant field flagged for documents/mail merge (custom,
  // builtin, guardian, computed) is insertable here too, on top of the
  // fixed purpose-specific ones above -- same {{key}}, same resolver
  // (src/lib/document-variables.ts) the real send uses. Event scope reads
  // the event's actual fields; org scope (no event yet) reads the org
  // templates' defaultSurfaces as a preview of what a synced event would get.
  const [extraVariables, setExtraVariables] = useState<{ key: string; label: string }[]>([]);
  useEffect(() => {
    const url =
      scope === "event"
        ? `/api/events/${eventId}/participant-fields?surface=email`
        : "/api/participant-field-templates";
    fetch(url)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { key: string; label: string; surfaces?: string[]; defaultSurfaces?: string[] }[]) => {
        const rows = scope === "event" ? data : data.filter((f) => f.defaultSurfaces?.includes("email"));
        setExtraVariables(rows.map((f) => ({ key: f.key, label: f.label })));
      })
      .catch(() => setExtraVariables([]));
  }, [scope, eventId]);
  const variables = [...purposeVariables, ...extraVariables.map((f) => f.key)];
  const extraDummyValues = Object.fromEntries(extraVariables.map((f) => [f.key, `[${f.label}]`]));

  // Event scope previews with a real participant of the event (server-filled,
  // same code as the send); org scope has no event, so it keeps sample values.
  const [previewParticipants, setPreviewParticipants] = useState<{ id: string; name: string }[]>([]);
  const [previewFor, setPreviewFor] = useState("");
  const [realPreview, setRealPreview] = useState<{ subject: string; body: string } | null>(null);
  useEffect(() => {
    if (scope !== "event") return;
    fetch(`/api/events/${eventId}/participants`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { id: string; name: string }[]) => {
        setPreviewParticipants(rows.map((r) => ({ id: r.id, name: r.name })));
        setPreviewFor((cur) => cur || rows[0]?.id || "");
      })
      .catch(() => {});
  }, [scope, eventId]);

  const [subject, setSubject] = useState("");
  const [oneBody, setOneBody] = useState("");
  // Text variants (2026-11-27): two whole texts by a condition (has a document / doesn't, adult / child), edited in
  // two tabs; stored as conditional blocks (src/lib/email-conditions.ts).
  const [variants, setVariants] = useState<Variants | null>(null);
  const [tab, setTab] = useState<"yes" | "no">("yes");
  const body = variants ? writeVariants(variants) : oneBody;
  const shown = variants ? variants[tab] : oneBody;
  const setShown = (v: string) => (variants ? setVariants({ ...variants, [tab]: v }) : setOneBody(v));
  const setBody = (b: string) => {
    const v = readVariants(b);
    setVariants(v);
    setOneBody(v ? "" : b);
  };
  const [docs, setDocs] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (scope !== "event") return;
    fetch(`/api/events/${eventId}/email-attachments`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { allDocuments?: { id: string; name: string }[] } | null) => setDocs(d?.allDocuments ?? []))
      .catch(() => {});
  }, [scope, eventId]);
  const conditions = [...docs.map((d) => ({ key: docConditionKey(d.id), label: d.name, yes: t("emailVariants.has", { doc: d.name }), no: t("emailVariants.hasNot", { doc: d.name }) })), { key: ADULT_CONDITION, label: t("emailVariants.adultLabel"), yes: t("emailVariants.adult"), no: t("emailVariants.child") }];
  const condition = variants ? conditions.find((c) => c.key === variants.cond) : null;
  const [hasOverride, setHasOverride] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Part 10 §3-7: "Porovnat s organizací" -- only meaningful once an event
  // override exists (otherwise the event IS the org default already).
  const [orgCompare, setOrgCompare] = useState<{ subject: string; body: string } | null>(null);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    if (scope !== "event" || !previewFor) return;
    const handle = setTimeout(() => {
      fetch(`/api/events/${eventId}/email-template/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purposeKey, participantId: previewFor, subject, body }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then(setRealPreview)
        .catch(() => setRealPreview(null));
    }, 400);
    return () => clearTimeout(handle);
  }, [scope, eventId, purposeKey, previewFor, subject, body]);

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
    setOrgCompare(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, eventId, purposeKey]);

  async function toggleCompare() {
    if (orgCompare) {
      setOrgCompare(null);
      return;
    }
    setComparing(true);
    const res = await fetch(`/api/email-templates?purposeKey=${encodeURIComponent(purposeKey)}`);
    setComparing(false);
    if (res.ok) {
      const data = await res.json();
      setOrgCompare({ subject: data.subject, body: data.body });
    }
  }

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
      const start = el?.selectionStart ?? shown.length;
      const end = el?.selectionEnd ?? shown.length;
      const next = shown.slice(0, start) + token + shown.slice(end);
      setShown(next);
      requestAnimationFrame(() => el?.setSelectionRange(start + token.length, start + token.length));
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body, purposeKey }),
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
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-semibold text-ink">{label}</h3>
          {scope === "event" && !eventOnly && (
            <span
              className={
                "rounded-full px-2 py-0.5 text-[11px] font-medium " +
                (hasOverride ? "bg-ember/15 text-ember" : "bg-paper-2 text-ink-secondary")
              }
            >
              {t(hasOverride ? "emailTemplateAdmin.badgeModified" : "emailTemplateAdmin.badgeDefault")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {scope === "event" && hasOverride && !eventOnly && (
            <button onClick={toggleCompare} disabled={comparing} className="text-[13px] text-ink-secondary hover:text-ink disabled:opacity-50">
              {orgCompare ? t("emailTemplateAdmin.hideCompare") : t("emailTemplateAdmin.compareWithOrg")}
            </button>
          )}
          {scope === "event" && hasOverride && !eventOnly && (
            <button onClick={handleRevert} disabled={saving} className="text-[13px] text-ink-secondary hover:text-ink disabled:opacity-50">
              {t("emailTemplateAdmin.revertToDefault")}
            </button>
          )}
        </div>
      </div>

      {scope === "event" && !hasOverride && (
        <p className="mb-3 text-[13px] text-ink-secondary">{t("emailTemplateAdmin.usingOrgDefault")}</p>
      )}

      {orgCompare && (
        <div className="mb-3 rounded-lg border border-mist bg-paper-2 p-3">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-ink-secondary">
            {t("emailTemplateAdmin.orgDefaultTitle")}
          </p>
          <p className="mb-1 text-[14px] font-medium text-ink">{orgCompare.subject}</p>
          <p className="whitespace-pre-wrap text-[13px] text-ink-secondary">{orgCompare.body}</p>
        </div>
      )}

      {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}

      <div className="mb-2 flex flex-wrap gap-1.5">
        {variables.map((name) => (
          <button key={name} type="button" onClick={() => insertVariable(name)} className={varBtnClass}>
            {`{{${name}}}`}
          </button>
        ))}
      </div>

      {!bodyOnly && (
        <>
          <label className="mb-1 block text-[12px] text-ink-secondary">{t("emailTemplateAdmin.subjectLabel")}</label>
          <input
            ref={subjectRef}
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onFocus={() => (activeFieldRef.current = "subject")}
            className={inputClass + " mb-3"}
          />
        </>
      )}

      {/* Text variants: a condition and a whole text for each answer. */}
      {!bodyOnly && (
        <div className="mb-2 rounded-lg border border-mist p-2.5">
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              checked={!!variants}
              onChange={(e) => {
                if (e.target.checked) {
                  setVariants({ cond: conditions[0].key, yes: oneBody, no: oneBody });
                  setTab("yes");
                } else if (variants && confirm(t("emailVariants.offConfirm", { which: tab === "yes" ? (condition?.yes ?? "") : (condition?.no ?? "") }))) {
                  setOneBody(variants[tab]);
                  setVariants(null);
                }
              }}
            />
            {t("emailVariants.toggle")}
          </label>
          <p className="mt-0.5 pl-6 text-[11.5px] text-ink-secondary">{t("emailVariants.hint")}</p>
          {variants && (
            <div className="mt-2 flex flex-col gap-2 pl-6">
              <label className="text-[12.5px] text-ink-secondary">
                {t("emailVariants.condition")}{" "}
                <select value={variants.cond} onChange={(e) => setVariants({ ...variants, cond: e.target.value })} className="rounded border border-mist bg-paper px-1.5 py-0.5 text-[12.5px] text-ink">
                  {conditions.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                  {!condition && <option value={variants.cond}>{variants.cond}</option>}
                </select>
              </label>
              <div role="tablist" className="flex flex-wrap items-center gap-1">
                {(["yes", "no"] as const).map((k) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-lg border px-3 py-1 text-[13px] ${tab === k ? "border-ember bg-ember/10 font-medium text-ink" : "border-mist text-ink-secondary"}`}>
                    {k === "yes" ? (condition?.yes ?? t("emailVariants.yes")) : (condition?.no ?? t("emailVariants.no"))}
                  </button>
                ))}
                <button type="button" onClick={() => setVariants({ ...variants, [tab]: variants[tab === "yes" ? "no" : "yes"] })} className="ml-auto text-[12px] text-ember hover:underline">
                  {t("emailVariants.copyOther")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <label className="mb-1 block text-[12px] text-ink-secondary">
        {t("emailTemplateAdmin.bodyLabel")}
        {variants && <span className="ml-1 font-medium text-ink">– {tab === "yes" ? condition?.yes : condition?.no}</span>}
      </label>
      {/* Formatted like the public pages' texts; sent as HTML + plain text (src/lib/mail-mime.ts). */}
      <div className="mb-3">
        <MarkdownEditor value={shown} onChange={setShown} textareaRef={bodyRef} onFocus={() => (activeFieldRef.current = "body")} rows={10} className={inputClass} t={t} />
      </div>

      {/* The event's documents this e-mail carries (participant e-mails only; the documents are per event). */}
      {scope === "event" && !bodyOnly && takesAttachments(purposeKey) && <TemplateAttachments eventId={eventId!} purposeKey={purposeKey} t={t} />}
      {!bodyOnly && <EmailFiles eventId={scope === "event" ? eventId : undefined} purposeKey={purposeKey} t={t} />}

      <div className="mb-4 rounded-lg border border-mist bg-paper-2 p-3">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-wide text-ink-secondary">{t("emailTemplateAdmin.previewTitle")}</p>
          {scope === "event" && previewParticipants.length > 0 && (
            <select value={previewFor} onChange={(e) => setPreviewFor(e.target.value)} className="rounded-lg border border-mist bg-paper px-2 py-0.5 text-[12px] text-ink">
              {previewParticipants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {scope === "event" && realPreview ? (
          <>
            {!bodyOnly && <p className="mb-2 text-[14px] font-medium text-ink">{realPreview.subject}</p>}
            <MarkdownText text={realPreview.body} className="text-[13px] text-ink-secondary" />
          </>
        ) : (
          <>
            {scope === "event" && previewParticipants.length === 0 && (
              <p className="mb-1 text-[11.5px] text-amber-700">{t("emailTemplateAdmin.previewSampleNoParticipants")}</p>
            )}
            <p className="mb-2 text-[14px] font-medium text-ink">{substituteDummyTemplateValues(subject, purposeKey, extraDummyValues)}</p>
            <MarkdownText text={substituteDummyTemplateValues(body, purposeKey, extraDummyValues)} className="text-[13px] text-ink-secondary" />
          </>
        )}
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className={btnPrimary}>
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}
