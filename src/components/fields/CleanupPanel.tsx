"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import type { FmOverview } from "./types";

// Fields Manager phase 7 (design §12, screen 20): "Úklid" -- merge duplicate fields, make a field calculated, delete
// merged fields. The only screen that changes existing data: a backup tick, a typed confirmation, and every action
// listed below with "Vrátit zpět".
type Preview = { blocker: string | null; profilesMoved: number; registrationsMoved: number; conflicts: number; settings: number; syncs: number; codeReaders: { key: string; readers: string[] }[] };
type LogRow = { id: string; action: string; at: string; undoneAt: string | null; target: string | null; oldKeys: string[]; mode: string | null; moved: number | null; conflicts: number | null; mergeLogId: string | null };
type Data = { suggestions: { id: string; keys: string[]; target: string }[]; log: LogRow[] };
const input = "rounded border border-mist bg-paper px-2 py-1 text-[13px]";

export default function CleanupPanel({ overview, onChanged }: { overview: FmOverview; onChanged: () => void }) {
  const { t } = useTranslations();
  const [data, setData] = useState<Data | null>(null);
  const [reload, setReload] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let gone = false;
    fetch("/api/fields/merge")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Data) => !gone && setData(d))
      .catch(() => !gone && setMsg(t("fieldsManager.loadFailed")));
    return () => {
      gone = true;
    };
  }, [reload, t]);

  const post = async (body: object) => {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/fields/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    const j = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      const key = `fieldsManager.err.${j.error ?? "failed"}`;
      setMsg(t(key) === key ? t("fieldsManager.err.failed") : t(key));
      return null;
    }
    return j;
  };
  const done = () => {
    setReload((n) => n + 1);
    onChanged();
  };
  const keys = overview.fields.filter((f) => f.kind === "custom" && !f.calculated).map((f) => f.key);
  const labelOf = (k: string) => overview.fields.find((f) => f.key === k)?.label ?? k;

  return (
    <div className="space-y-4 text-[13px]">
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-amber-900">{t("fieldsManager.cleanup.warning")}</p>
      {msg && <p className="text-red-700">{msg}</p>}
      <MergeForm keys={keys} labelOf={labelOf} suggestions={data?.suggestions ?? []} post={post} busy={busy} onDone={done} />
      <CalcForm keys={keys} labelOf={labelOf} post={post} busy={busy} onDone={done} />
      {data && data.log.length > 0 && (
        <section className="space-y-1 rounded-xl border border-mist p-3">
          <h3 className="font-semibold">{t("fieldsManager.cleanup.history")}</h3>
          {data.log.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-2 border-t border-mist py-1">
              <span className="text-ink-secondary">{new Date(l.at).toLocaleString()}</span>
              <span>{t(`fieldsManager.cleanup.action.${l.action}`)}</span>
              <span className="font-mono">{l.action === "merge" ? `${l.oldKeys.join(", ")} → ${l.target}` : l.action === "make_calculated" ? l.target : l.oldKeys.join(", ")}</span>
              {l.moved !== null && <span className="text-ink-secondary">{t("fieldsManager.cleanup.movedN", { n: String(l.moved) })}</span>}
              {!!l.conflicts && <span className="text-amber-800">{t("fieldsManager.cleanup.conflictsN", { n: String(l.conflicts) })}</span>}
              {l.undoneAt ? (
                <span className="ml-auto text-ink-secondary">{t("fieldsManager.import.wasUndone")}</span>
              ) : (
                <span className="ml-auto flex gap-1">
                  {l.action === "merge" && !data.log.some((x) => x.mergeLogId === l.id && !x.undoneAt) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        const c = prompt(t("fieldsManager.cleanup.deleteConfirm", { key: l.target ?? "" }));
                        if (c !== null && (await post({ action: "delete", logId: l.id, confirm: c.trim() }))) done();
                      }}
                      className="rounded border border-mist px-2 py-0.5 hover:bg-paper-2"
                    >
                      {t("fieldsManager.cleanup.deleteOld")}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      if (!confirm(t("fieldsManager.cleanup.undoConfirm"))) return;
                      const r = await post({ action: "undo", logId: l.id });
                      if (r) {
                        setMsg(t("fieldsManager.import.undone", { n: String(r.undone), kept: String(r.kept) }));
                        done();
                      }
                    }}
                    className="rounded border border-mist px-2 py-0.5 hover:bg-paper-2"
                  >
                    {t("fieldsManager.undo")}
                  </button>
                </span>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

type FormProps = { keys: string[]; labelOf: (k: string) => string; post: (b: object) => Promise<Record<string, number> | null>; busy: boolean; onDone: () => void };

function Safety({ value, setValue, backup, setBackup, word }: { value: string; setValue: (v: string) => void; backup: boolean; setBackup: (v: boolean) => void; word: string }) {
  const { t } = useTranslations();
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={backup} onChange={(e) => setBackup(e.target.checked)} /> {t("fieldsManager.cleanup.backupTaken")}
      </label>
      <label className="block">
        {t("fieldsManager.typeToConfirm", { key: word })}
        <input value={value} onChange={(e) => setValue(e.target.value)} className={`${input} ml-2 font-mono`} />
      </label>
    </div>
  );
}

function MergeForm({ keys, labelOf, suggestions, post, busy, onDone }: FormProps & { suggestions: Data["suggestions"] }) {
  const { t } = useTranslations();
  const [target, setTarget] = useState("");
  const [old, setOld] = useState<string[]>([]);
  const [mode, setMode] = useState<"alias" | "direct">("alias");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [backup, setBackup] = useState(false);
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const all = [...new Set([...keys, ...suggestions.flatMap((s) => s.keys)])];
  const reset = () => {
    setPreview(null);
    setResult(null);
    setConfirmText("");
  };
  return (
    <section className="space-y-2 rounded-xl border border-mist p-3">
      <h3 className="font-semibold">{t("fieldsManager.cleanup.mergeTitle")}</h3>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions.map((s) => (
            <button key={s.id} type="button" onClick={() => (setTarget(s.target), setOld(s.keys.filter((k) => k !== s.target)), reset())} className="rounded-full border border-dashed border-ember/60 px-2 py-0.5 hover:bg-paper-2">
              {t(`fieldsManager.cleanup.group.${s.id}`)}: {s.keys.join(", ")}
            </button>
          ))}
        </div>
      )}
      <label className="block">
        {t("fieldsManager.cleanup.target")}{" "}
        <select value={target} onChange={(e) => (setTarget(e.target.value), setOld(old.filter((k) => k !== e.target.value)), reset())} className={input}>
          <option value="">—</option>
          {all.map((k) => (
            <option key={k} value={k}>{labelOf(k)} ({k})</option>
          ))}
        </select>
      </label>
      <div>
        {t("fieldsManager.cleanup.oldFields")}
        <div className="mt-1 flex flex-wrap gap-2">
          {all.filter((k) => k !== target).map((k) => (
            <label key={k} className="flex items-center gap-1">
              <input type="checkbox" checked={old.includes(k)} onChange={(e) => (setOld(e.target.checked ? [...old, k] : old.filter((x) => x !== k)), reset())} />
              <span className="font-mono text-[12px]">{k}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        {(["alias", "direct"] as const).map((m) => (
          <label key={m} className="flex items-start gap-1">
            <input type="radio" checked={mode === m} onChange={() => setMode(m)} className="mt-1" />
            <span>
              <b>{t(`fieldsManager.cleanup.mode.${m}`)}</b> <span className="text-ink-secondary">{t(`fieldsManager.cleanup.mode.${m}Help`)}</span>
            </span>
          </label>
        ))}
      </div>
      <button type="button" disabled={busy || !target || !old.length} onClick={async () => setPreview((await post({ action: "preview", target, oldKeys: old })) as Preview | null)} className="rounded-lg border border-mist px-3 py-1 hover:bg-paper-2 disabled:opacity-40">
        {t("fieldsManager.checkRename")}
      </button>
      {preview?.blocker && <p className="text-red-700">{t(`fieldsManager.err.${preview.blocker}`)}</p>}
      {preview && !preview.blocker && !result && (
        <div className="space-y-2 rounded-lg bg-paper-2 p-2">
          <ul className="list-disc pl-5">
            <li>{t("fieldsManager.cleanup.willMove", { profiles: String(preview.profilesMoved), registrations: String(preview.registrationsMoved) })}</li>
            <li>{t("fieldsManager.cleanup.willConflict", { n: String(preview.conflicts) })}</li>
            <li>{t("fieldsManager.cleanup.willRepoint", { settings: String(preview.settings), syncs: String(preview.syncs) })}</li>
            <li>{t(mode === "direct" ? "fieldsManager.cleanup.willQueueDocs" : "fieldsManager.cleanup.willAlias")}</li>
          </ul>
          {preview.codeReaders.map((c) => (
            <p key={c.key} className="text-amber-800">{t("fieldsManager.cleanup.codeReads", { key: c.key, readers: c.readers.map((r) => t(`fieldsManager.cleanup.reader.${r}`)).join(", ") })}</p>
          ))}
          <Safety value={confirmText} setValue={setConfirmText} backup={backup} setBackup={setBackup} word={target} />
          <button
            type="button"
            disabled={busy || !backup || confirmText.trim() !== target}
            onClick={async () => {
              const r = await post({ action: "merge", target, oldKeys: old, mode, confirm: confirmText.trim() });
              if (r) {
                setResult(r);
                onDone();
              }
            }}
            className="rounded-lg bg-ember px-3 py-1 text-white disabled:opacity-40"
          >
            {t("fieldsManager.cleanup.mergeNow")}
          </button>
        </div>
      )}
      {result && <p className="font-medium">{t("fieldsManager.cleanup.merged", { n: String(result.moved), c: String(result.conflicts), d: String(result.docEdits) })}</p>}
    </section>
  );
}

function CalcForm({ keys, labelOf, post, busy, onDone }: FormProps) {
  const { t } = useTranslations();
  const [key, setKey] = useState("");
  const [parts, setParts] = useState<string[]>([]);
  const [separator, setSeparator] = useState(", ");
  const [fillFrom, setFillFrom] = useState("");
  const [loss, setLoss] = useState<{ profiles: number; registrations: number } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [backup, setBackup] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  return (
    <section className="space-y-2 rounded-xl border border-mist p-3">
      <h3 className="font-semibold">{t("fieldsManager.cleanup.calcTitle")}</h3>
      <p className="text-ink-secondary">{t("fieldsManager.cleanup.calcHelp")}</p>
      <label className="block">
        {t("fieldsManager.cleanup.calcField")}{" "}
        <select value={key} onChange={(e) => (setKey(e.target.value), setLoss(null), setResult(null))} className={input}>
          <option value="">—</option>
          {keys.map((k) => (
            <option key={k} value={k}>{labelOf(k)} ({k})</option>
          ))}
        </select>
      </label>
      <div>
        {t("fieldsManager.cleanup.calcParts")}
        <div className="mt-1 flex flex-wrap gap-2">
          {keys.filter((k) => k !== key).map((k) => (
            <label key={k} className="flex items-center gap-1">
              <input type="checkbox" checked={parts.includes(k)} onChange={(e) => (setParts(e.target.checked ? [...parts, k] : parts.filter((x) => x !== k)), setLoss(null))} />
              <span className="font-mono text-[12px]">{parts.includes(k) ? `${parts.indexOf(k) + 1}. ` : ""}{k}</span>
            </label>
          ))}
        </div>
      </div>
      <label>
        {t("fieldsManager.separator")} <input value={separator} onChange={(e) => setSeparator(e.target.value)} className={`${input} w-16 font-mono`} />
      </label>
      <button type="button" disabled={busy || !key || !parts.length} onClick={async () => setLoss((await post({ action: "calc_preview", key, parts })) as typeof loss)} className="ml-2 rounded-lg border border-mist px-3 py-1 hover:bg-paper-2 disabled:opacity-40">
        {t("fieldsManager.checkRename")}
      </button>
      {loss && result === null && (
        <div className="space-y-2 rounded-lg bg-paper-2 p-2">
          <p className={loss.profiles + loss.registrations ? "text-amber-800" : ""}>{t("fieldsManager.cleanup.calcLoss", { profiles: String(loss.profiles), registrations: String(loss.registrations) })}</p>
          {loss.profiles + loss.registrations > 0 && (
            <label className="block">
              {t("fieldsManager.cleanup.fillFrom")}{" "}
              <select value={fillFrom} onChange={(e) => setFillFrom(e.target.value)} className={input}>
                <option value="">{t("fieldsManager.cleanup.fillNone")}</option>
                {parts.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
          )}
          <Safety value={confirmText} setValue={setConfirmText} backup={backup} setBackup={setBackup} word={key} />
          <button
            type="button"
            disabled={busy || !backup || confirmText.trim() !== key}
            onClick={async () => {
              const r = await post({ action: "make_calculated", key, parts, separator, fillFrom: fillFrom || undefined, confirm: confirmText.trim() });
              if (r) {
                setResult(r.filled);
                onDone();
              }
            }}
            className="rounded-lg bg-ember px-3 py-1 text-white disabled:opacity-40"
          >
            {t("fieldsManager.cleanup.calcNow")}
          </button>
        </div>
      )}
      {result !== null && <p className="font-medium">{t("fieldsManager.cleanup.calcDone", { n: String(result) })}</p>}
    </section>
  );
}
