"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { driveErrorText, type DriveErrorInfo } from "@/lib/drive-error-messages";

type Placeholder = { key: string; status: "ok" | "field_off" | "unknown" | "invalid"; hasSpaces: boolean };
type CheckData = {
  template: { name: string; docId?: string; error?: string; errorParams?: DriveErrorInfo; placeholders: Placeholder[] };
  unusedFields: { key: string; label: string }[];
  values: Record<string, string> | null;
  imageKeys: string[];
};
type ParticipantOption = { id: string; name: string };

const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const btnSecondary =
  "rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2 disabled:opacity-50";

// Preview + check for one Google-Docs document template: the template merged
// with a chosen (or random) participant next to the variables it uses, their
// values and whether each is mapped. Google Docs stays the editor -- edit
// there, come back, hit refresh. Read-only: nothing is saved, sent or numbered.
export default function DocumentTemplatePage({ params }: { params: Promise<{ id: string; docTypeId: string }> }) {
  const { id: eventId, docTypeId } = use(params);
  const { t } = useTranslations();

  const [participants, setParticipants] = useState<ParticipantOption[]>([]);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const key = participantId ? `${participantId}:${tick}` : null;

  // Results carry the key they were made for, so "loading" is derived
  // (result key !== current key) instead of set synchronously.
  const [check, setCheck] = useState<{ key: string; data: CheckData | null } | null>(null);
  const [pdf, setPdf] = useState<{ key: string; url: string | null; error?: { code: string; info: DriveErrorInfo } } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    fetch(`/api/events/${eventId}/participants`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ParticipantOption[]) => {
        const list = rows.map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name, "cs"));
        setParticipants(list);
        if (list.length > 0) setParticipantId(list[Math.floor(Math.random() * list.length)].id);
      })
      .catch(() => {});
  }, [eventId]);

  useEffect(() => {
    if (!key || !participantId) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    const q = `participantId=${encodeURIComponent(participantId)}`;
    const base = `/api/events/${eventId}/document-types/${docTypeId}`;

    fetch(`${base}/check?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: CheckData | null) => {
        if (cancelled) return;
        setCheck({ key, data });
        // Everything addable starts ticked -- "add all missing" is the common case.
        setSelected(new Set((data?.template.placeholders ?? []).filter((p) => p.status === "field_off" || p.status === "unknown").map((p) => p.key)));
      })
      .catch(() => !cancelled && setCheck({ key, data: null }));

    fetch(`${base}/preview?${q}`)
      .then(async (r) => {
        if (r.ok) {
          objectUrl = URL.createObjectURL(await r.blob());
          if (!cancelled) setPdf({ key, url: objectUrl });
          return;
        }
        // The route answers with a stable Drive error code (+ the account/folder involved).
        const data = await r.json().catch(() => ({}));
        if (!cancelled) setPdf({ key, url: null, error: data.error ? { code: data.error, info: data } : undefined });
      })
      .catch(() => !cancelled && setPdf({ key, url: null }));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key, participantId, eventId, docTypeId]);

  const checkReady = check && check.key === key ? check : null;
  const pdfReady = pdf && pdf.key === key ? pdf : null;
  const data = checkReady?.data ?? null;
  const placeholders = data?.template.placeholders ?? [];
  const problems = placeholders.filter((p) => p.status !== "ok" || p.hasSpaces).length;
  const addable = placeholders.filter((p) => p.status === "field_off" || p.status === "unknown");

  function shuffle() {
    const others = participants.filter((p) => p.id !== participantId);
    if (others.length > 0) setParticipantId(others[Math.floor(Math.random() * others.length)].id);
  }

  async function addSelected() {
    setApplying(true);
    await fetch(`/api/events/${eventId}/template-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: [...selected] }),
    });
    setApplying(false);
    setTick((n) => n + 1);
  }

  function toggle(k: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(k)) next.add(k);
      return next;
    });
  }

  function valueOf(p: Placeholder): string | null {
    if (!data?.values) return null;
    if (data.imageKeys.includes(p.key)) return t("templatePreview.imageValue");
    return data.values[p.key] ?? null;
  }

  return (
    <div className="mx-auto max-w-[1280px] p-4 md:p-8">
      <a href={`/events/${eventId}?tab=mail`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("templatePreview.back")}
      </a>
      <div className="mb-4 mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold text-ink">
          {t("templatePreview.title")}
          {data && <span className="text-ink-secondary"> — {data.template.name}</span>}
        </h1>
        {data?.template.docId && (
          <a
            href={`https://docs.google.com/document/d/${data.template.docId}/edit`}
            target="_blank"
            rel="noreferrer"
            className={btnSecondary}
          >
            {t("templatePreview.openInDocs")}
          </a>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="text-[13px] text-ink-secondary">{t("templatePreview.participant")}</label>
        <select
          value={participantId ?? ""}
          onChange={(e) => setParticipantId(e.target.value)}
          className="min-w-[220px] rounded-lg border border-mist bg-paper-2 px-2.5 py-1.5 text-[13px] text-ink"
        >
          {participants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button onClick={shuffle} disabled={participants.length < 2} className={btnSecondary}>
          {t("templatePreview.shuffle")}
        </button>
        <button onClick={() => setTick((n) => n + 1)} disabled={!participantId} className={btnSecondary}>
          {t("templatePreview.refresh")}
        </button>
        <span className="text-[12px] text-ink-secondary">{t("templatePreview.hint")}</span>
      </div>

      {participants.length === 0 && <p className="text-[14px] text-ink-secondary">{t("templatePreview.noParticipants")}</p>}

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-h-[70vh] flex-1 overflow-hidden rounded-lg border border-mist bg-paper-2">
          {!pdfReady ? (
            <p className="p-6 text-[14px] text-ink-secondary">{key ? t("templatePreview.generating") : ""}</p>
          ) : pdfReady.url ? (
            <iframe src={pdfReady.url} title="preview" className="h-[80vh] w-full border-0" />
          ) : (
            <p className="p-6 text-[14px] text-red-600">
              {pdfReady.error ? driveErrorText(t, pdfReady.error.code, pdfReady.error.info) : t("templatePreview.pdfFailed")}
            </p>
          )}
        </div>

        <aside className="w-full shrink-0 rounded-lg border border-mist bg-paper p-4 lg:w-[380px]">
          <h2 className="mb-1 text-[15px] font-semibold text-ink">{t("templatePreview.variables")}</h2>
          {!checkReady ? (
            <p className="text-[13px] text-ink-secondary">{t("common.loading")}</p>
          ) : !data ? (
            <p className="text-[13px] text-red-600">{t("templateCheck.failed")}</p>
          ) : data.template.error ? (
            <p className="text-[13px] text-red-600">{driveErrorText(t, data.template.error, data.template.errorParams)}</p>
          ) : (
            <>
              <p className="mb-3 text-[12px] text-ink-secondary">
                {t("templatePreview.summary", { total: String(placeholders.length), problems: String(problems) })}
              </p>
              <ul className="flex flex-col gap-2">
                {placeholders.map((p) => {
                  const value = valueOf(p);
                  const addableRow = p.status === "field_off" || p.status === "unknown";
                  return (
                    <li key={p.key} className="flex items-start gap-2 text-[13px]">
                      {addableRow ? (
                        <input type="checkbox" className="mt-1" checked={selected.has(p.key)} onChange={() => toggle(p.key)} />
                      ) : (
                        <span className={"mt-px w-[13px] " + (p.status === "ok" ? "text-pine" : "text-red-600")}>
                          {p.status === "ok" ? "✓" : "✗"}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <code className="text-ink">{`{{${p.key}}}`}</code>
                        {p.status === "ok" ? (
                          <div className={"break-words " + (value ? "text-ink-secondary" : "text-ink-secondary/60")}>{value || "—"}</div>
                        ) : (
                          <div className="text-amber-700">{t(`templateCheck.status.${p.status}`)}</div>
                        )}
                        {p.hasSpaces && <div className="text-amber-700">{t("templateCheck.hasSpaces")}</div>}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {addable.length > 0 && (
                <div className="mt-4 border-t border-mist pt-3">
                  <p className="mb-2 text-[12px] text-ink-secondary">{t("templateCheck.addHint")}</p>
                  <button onClick={addSelected} disabled={applying || selected.size === 0} className={btnPrimary}>
                    {applying ? t("common.loading") : t("templateCheck.addSelected", { count: String(selected.size) })}
                  </button>
                </div>
              )}

              {data.unusedFields.length > 0 && (
                <div className="mt-4 border-t border-mist pt-3">
                  <p className="mb-1 text-[12px] font-medium text-ink">{t("templatePreview.unusedTitle")}</p>
                  <p className="text-[12px] text-ink-secondary">{data.unusedFields.map((f) => f.label).join(", ")}</p>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
