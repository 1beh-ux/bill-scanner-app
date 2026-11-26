"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { editKey } from "@/lib/doc-edits";
import { NewFieldForm } from "./FieldEditors";
import type { FmDocTemplate, FmOverview } from "./types";

// Fields Manager phase 6 (design §11, screens 18–19): a document type's Google Doc with its placeholders coloured
// (green current, amber old name, blue event variable, red can't be resolved / has spaces), suggested fixes queued
// as pending edits, and one save. Nothing is written to the Doc before "Uložit do Google Docs".
type Status = "current" | "alias" | "variable" | "spaces" | "unresolved";
type Edit = { type: "rename"; from: string; to: string } | { type: "typed"; text: string; key: string };
type Analysis = {
  docId: string;
  title: string;
  paragraphs: { text: string; start: number; where: "body" | "header" | "footer" }[];
  placeholders: { key: string; raw: string; status: Status; canonical?: string }[];
  broken: string[];
  typed: { key: string; text: string; count: number }[];
  sharedWith: number;
  edits: { id: string; edit: Edit; reason: string }[];
  targets: Target[];
};
type Target = { key: string; label: string; group: "field" | "guardian" | "event" };
const COLOR: Record<Status, string> = {
  current: "bg-emerald-100 text-emerald-900",
  alias: "bg-amber-100 text-amber-900",
  variable: "bg-sky-100 text-sky-900",
  spaces: "bg-red-100 text-red-800",
  unresolved: "bg-red-100 text-red-800",
};

export default function DocumentEditor({ eventId, docs, initialDoc, overview, onChanged }: { eventId: string; docs: FmDocTemplate[] | null; initialDoc?: string | null; overview: FmOverview; onChanged: () => void }) {
  const { t } = useTranslations();
  const usable = (docs ?? []).filter((d) => !d.error);
  const [docType, setDocType] = useState<string>(initialDoc ?? "");
  const [data, setData] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const current = docType || usable[0]?.docTypeId || "";

  useEffect(() => {
    if (!current) return;
    let gone = false;
    fetch(`/api/fields/doc?event=${encodeURIComponent(eventId)}&docType=${encodeURIComponent(current)}`)
      .then(async (r) => (r.ok ? r.json() : Promise.reject((await r.json().catch(() => ({}))).error)))
      .then((d: Analysis) => {
        if (gone) return;
        setData(d);
        setError(null);
      })
      .catch((code) => !gone && setError(t(`driveSettings.error.${code ?? "drive_unknown"}`)));
    return () => {
      gone = true;
    };
  }, [eventId, current, reload, t]);

  const post = async (body: object) => {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/fields/doc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: eventId, docType: current, ...body }) }).catch(() => null);
    setBusy(false);
    const j = res ? await res.json().catch(() => ({})) : {};
    const key = `fieldsManager.doc.err.${j.error ?? "failed"}`;
    if (!res?.ok) setMsg(t(key) === key ? t("fieldsManager.err.failed") : t(key));
    setReload((n) => n + 1);
    return res?.ok ? j : null;
  };
  const queue = (edit: Edit, reason: string) => post({ action: "queue", edit, reason });

  if (docs === null) return <p className="text-[13px] text-ink-secondary">{t("fieldsManager.loadingDocuments")}</p>;
  if (!usable.length) return <p className="rounded-xl border border-mist p-4 text-[13px] text-ink-secondary">{t("fieldsManager.doc.none")}</p>;

  const unique = (s: Status) => [...new Map((data?.placeholders ?? []).filter((p) => p.status === s).map((p) => [p.raw, p])).values()];
  const aliases = unique("alias");
  const pendingKey = editKey;
  const queued = new Set((data?.edits ?? []).map((e) => pendingKey(e.edit)));

  return (
    <div className="space-y-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <select value={current} onChange={(e) => {
            setDocType(e.target.value);
            setData(null);
          }} className="rounded-lg border border-mist bg-paper px-2.5 py-1.5">
          {usable.map((d) => (
            <option key={d.docTypeId} value={d.docTypeId}>{d.name}</option>
          ))}
        </select>
        {data && (
          <a href={`https://docs.google.com/document/d/${data.docId}/edit`} target="_blank" rel="noreferrer" className="text-ember underline">
            {t("fieldsManager.doc.open")}
          </a>
        )}
      </div>
      {error && <p className="text-red-700">{error}</p>}
      {data && data.sharedWith > 0 && <p className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-amber-900">{t("fieldsManager.doc.shared", { n: String(data.sharedWith) })}</p>}

      {data && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="max-h-[70vh] overflow-auto rounded-xl border border-mist bg-paper p-4 leading-relaxed">
            {data.paragraphs.map((p, i) => (
              <p key={i} className={`whitespace-pre-wrap ${p.where !== "body" ? "text-[12px] text-ink-secondary" : ""}`}>
                {p.where !== "body" && <span className="mr-1 rounded bg-paper-2 px-1">{t(`fieldsManager.doc.${p.where}`)}</span>}
                {p.text.split(/(\{\{[^{}\n]*\}\})/g).map((part, j) => {
                  const ph = data.placeholders.find((x) => x.raw === part);
                  return ph ? (
                    <mark key={j} className={`rounded px-0.5 ${COLOR[ph.status]}`} title={ph.canonical ? `→ {{${ph.canonical}}}` : t(`fieldsManager.doc.status.${ph.status}`)}>{part}</mark>
                  ) : (
                    <span key={j}>{part.replace(/\n$/, "")}</span>
                  );
                })}
              </p>
            ))}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-1 text-[12px]">
              {(["current", "alias", "variable", "unresolved"] as const).map((s) => (
                <span key={s} className={`rounded-full px-2 py-0.5 ${COLOR[s]}`}>{t(`fieldsManager.doc.status.${s}`)}</span>
              ))}
            </div>

            {aliases.length > 0 && (
              <section className="space-y-1 rounded-xl border border-mist p-3">
                <h3 className="font-semibold">{t("fieldsManager.doc.oldNames")}</h3>
                {aliases.map((p) => (
                  <Row key={p.raw} left={`${p.raw} → {{${p.canonical}}}`} done={queued.has(pendingKey({ type: "rename", from: p.key, to: p.canonical! }))} onClick={() => queue({ type: "rename", from: p.key, to: p.canonical! }, "alias")} label={t("fieldsManager.doc.update")} busy={busy} />
                ))}
                {aliases.length > 1 && (
                  <button type="button" disabled={busy} onClick={async () => { for (const p of aliases) await queue({ type: "rename", from: p.key, to: p.canonical! }, "alias"); }} className="rounded-lg border border-mist px-2 py-0.5 hover:bg-paper-2">
                    {t("fieldsManager.doc.updateAll")}
                  </button>
                )}
              </section>
            )}

            {unique("spaces").length > 0 && (
              <section className="space-y-1 rounded-xl border border-mist p-3">
                <h3 className="font-semibold">{t("fieldsManager.doc.spaces")}</h3>
                {unique("spaces").map((p) => (
                  <Row key={p.raw} left={`${p.raw} → {{${p.key}}}`} done={queued.has(pendingKey({ type: "rename", from: p.key, to: p.key }))} onClick={() => queue({ type: "rename", from: p.key, to: p.key }, "spaces")} label={t("fieldsManager.doc.fix")} busy={busy} />
                ))}
              </section>
            )}

            {data.typed.length > 0 && (
              <section className="space-y-1 rounded-xl border border-mist p-3">
                <h3 className="font-semibold">{t("fieldsManager.doc.typed")}</h3>
                {data.typed.map((x) => (
                  <Row key={x.key} left={`„${x.text}“ ×${x.count} → {{${x.key}}}`} done={queued.has(pendingKey({ type: "typed", text: x.text, key: x.key }))} onClick={() => queue({ type: "typed", text: x.text, key: x.key }, "typed")} label={t("fieldsManager.doc.useVariable")} busy={busy} />
                ))}
              </section>
            )}

            {(unique("unresolved").length > 0 || data.broken.length > 0) && (
              <section className="space-y-1 rounded-xl border border-red-200 p-3">
                <h3 className="font-semibold text-red-800">{t("fieldsManager.doc.connectTitle")}</h3>
                <p className="text-[12px] text-ink-secondary">{t("fieldsManager.doc.connectHint")}</p>
                {unique("unresolved").map((p) => (
                  <Connect
                    key={p.raw}
                    phKey={p.key}
                    targets={data.targets}
                    busy={busy}
                    renamed={(data.edits ?? []).some((e) => e.edit.type === "rename" && e.edit.from === p.key)}
                    onAlias={async (target) => { const r = await post({ action: "alias", alias: p.key, target }); if (r) setMsg(t("fieldsManager.doc.aliasSaved", { from: p.key, to: target })); }}
                    onRename={(target) => queue({ type: "rename", from: p.key, to: target }, "connect")}
                    overview={overview}
                    onCreated={async (k) => {
                      // A different key than the document uses: the document is renamed to it on save.
                      if (k !== p.key) await queue({ type: "rename", from: p.key, to: k }, "connect");
                      else setReload((n) => n + 1);
                      setMsg(t("fieldsManager.doc.fieldCreated", { key: k }));
                      onChanged();
                    }}
                  />
                ))}
                {data.broken.map((b, i) => (
                  <div key={i} className="font-mono">{b} <span className="font-sans text-ink-secondary">({t("fieldsManager.doc.brokenHint")})</span></div>
                ))}
              </section>
            )}

            <section className="space-y-1 rounded-xl border border-ember/50 p-3">
              <h3 className="font-semibold">{t("fieldsManager.doc.pending", { n: String(data.edits.length) })}</h3>
              {data.edits.map((e) => (
                <div key={e.id} className="flex items-center gap-2">
                  <span className="font-mono text-[12px]">{e.edit.type === "rename" ? `{{${e.edit.from}}} → {{${e.edit.to}}}` : `„${e.edit.text}“ → {{${e.edit.key}}}`}</span>
                  <button type="button" disabled={busy} onClick={() => post({ action: "discard", editId: e.id })} className="ml-auto text-ink-secondary hover:text-ink" aria-label={t("fieldsManager.cancel")}>×</button>
                </div>
              ))}
              {data.edits.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {data.sharedWith === 0 ? (
                    <button type="button" disabled={busy} onClick={async () => { const r = await post({ action: "save" }); if (r) setMsg(t("fieldsManager.doc.saved", { n: String(r.saved) })); }} className="rounded-lg bg-ember px-3 py-1 text-white disabled:opacity-40">
                      {t("fieldsManager.doc.save")}
                    </button>
                  ) : (
                    <button type="button" disabled={busy} onClick={async () => { if (!confirm(t("fieldsManager.doc.copyConfirm"))) return; const r = await post({ action: "save", copy: true }); if (r) setMsg(t("fieldsManager.doc.savedCopy")); }} className="rounded-lg bg-ember px-3 py-1 text-white disabled:opacity-40">
                      {t("fieldsManager.doc.saveCopy")}
                    </button>
                  )}
                </div>
              )}
              {msg && <p className="text-ink-secondary">{msg}</p>}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ left, done, onClick, label, busy }: { left: string; done: boolean; onClick: () => void; label: string; busy: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[12px]">{left}</span>
      <button type="button" disabled={busy || done} onClick={onClick} className="ml-auto rounded border border-mist px-2 py-0.5 text-[12px] hover:bg-paper-2 disabled:opacity-40">
        {done ? "✓" : label}
      </button>
    </div>
  );
}

function Connect({ phKey, targets, busy, renamed, onAlias, onRename, overview, onCreated }: { phKey: string; targets: Target[]; busy: boolean; renamed: boolean; onAlias: (target: string) => void; onRename: (target: string) => void; overview: FmOverview; onCreated: (key: string) => void }) {
  const { t } = useTranslations();
  const [target, setTarget] = useState("");
  const [creating, setCreating] = useState(false);
  if (creating)
    return (
      <div className="border-t border-red-100 pt-1.5">
        <NewFieldForm overview={overview} initialKey={phKey} onDone={(k) => { setCreating(false); if (k) onCreated(k); }} />
        <button type="button" onClick={() => setCreating(false)} className="mt-1 text-[12px] text-ink-secondary hover:text-ink">{t("fieldsManager.cancel")}</button>
      </div>
    );
  const label = (x: Target) => {
    if (x.group !== "guardian") return x.label === x.key ? x.key : `${x.label} ({{${x.key}}})`;
    const [n, prop] = x.label.split("|");
    // "=<name>": an own guardian field -- its name as is.
    return `${t("fieldsManager.doc.guardianSlot", { n })} – ${prop.startsWith("=") ? prop.slice(1) : t(`fieldsManager.doc.gprop.${prop}`)}`;
  };
  const groups = (["field", "guardian", "event"] as const).map((g) => [g, targets.filter((x) => x.group === g)] as const);
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-red-100 pt-1.5 first:border-0">
      <span className="min-w-[90px] font-mono text-[12px]">{`{{${phKey}}}`}</span>
      <select value={target} onChange={(e) => setTarget(e.target.value)} disabled={renamed} className="min-w-0 flex-1 rounded border border-mist bg-paper px-1.5 py-0.5 text-[12px]">
        <option value="">{t("fieldsManager.doc.connectPick")}</option>
        {groups.map(([g, list]) => list.length > 0 && (
          <optgroup key={g} label={t(`fieldsManager.doc.targetGroup.${g}`)}>
            {list.map((x) => <option key={x.key} value={x.key}>{label(x)}</option>)}
          </optgroup>
        ))}
      </select>
      {renamed ? (
        <span className="text-[12px] text-ink-secondary">{t("fieldsManager.doc.connectQueued")}</span>
      ) : (
        <>
          <button type="button" disabled={busy || !target} onClick={() => onAlias(target)} className="rounded border border-mist px-2 py-0.5 text-[12px] hover:bg-paper-2 disabled:opacity-40" title={t("fieldsManager.doc.asAliasHint")}>
            {t("fieldsManager.doc.asAlias")}
          </button>
          <button type="button" disabled={busy || !target} onClick={() => onRename(target)} className="rounded border border-mist px-2 py-0.5 text-[12px] hover:bg-paper-2 disabled:opacity-40" title={t("fieldsManager.doc.renameInDocHint")}>
            {t("fieldsManager.doc.renameInDoc")}
          </button>
          <button type="button" disabled={busy} onClick={() => setCreating(true)} className="rounded border border-dashed border-ember/60 px-2 py-0.5 text-[12px] hover:bg-paper-2 disabled:opacity-40" title={t("fieldsManager.doc.newFieldHint")}>
            + {t("fieldsManager.doc.newField")}
          </button>
        </>
      )}
    </div>
  );
}
