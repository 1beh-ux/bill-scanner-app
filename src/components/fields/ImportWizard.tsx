"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { parseTable } from "@/lib/planning-import";
import { toBoolean } from "@/lib/participant-fields";
import {
  guessMapping,
  guessType,
  slotMapping,
  SYNC_INTERVALS,
  isWritableField,
  IGNORE,
  MATCH_BY_NAME,
  NAME_FIELD,
  FIRST_NAME_FIELD,
  LAST_NAME_FIELD,
  type FieldInfo,
  type FieldMode,
  type ImportPolicy,
  type OnNew,
} from "@/lib/participant-sync";
import { slugKey } from "./FieldEditors";

// Fields Manager phase 4 (design §9, screens 09–16): source -> columns -> values -> people -> existing values ->
// import (+ undo). A front end over the existing sync planner: every step's choices are the connection's settings,
// the server plans exactly what it will write.
type Table = { headers: string[]; rows: string[][] };
type Field = FieldInfo & { section: string | null };
type Sync = { id: string; name: string; sheetId: string; tab?: string; autoSync?: boolean; everyHours?: number; mapping: Record<string, string>; matchBy: string; onNew: OnNew; onMatch: string; valueMap?: Record<string, Record<string, string>>; policy?: ImportPolicy; mergeInto?: Record<string, string>; excluded: string[]; overrides: Record<string, Record<string, string>> };
type Person = { id: string; name: string; dateOfBirth: string | null };
type Run = { id: string; createdAt: string; undoneAt: string | null; writes: number };
type PlanRow = { rowNumber: number; rowKey: string; cells: string[]; status: string; errors: string[]; warnings?: string[]; merged?: boolean; participant: { id: string; name: string } | null; changes: { field: string; from: string; to: string }[] };
type Data = { syncs: Sync[]; fields: Field[]; participants: Person[]; runs: Run[] };

const STEPS = ["source", "columns", "values", "people", "existing", "apply"] as const;
const input = "rounded border border-mist bg-paper px-2 py-1 text-[13px]";
const CHOICE_TYPES = new Set(["select", "multi", "boolean", "consent"]);
/** A translation, or `fallback` when the key has none (t returns the key itself then). */
const tOr = (t: (k: string) => string, key: string, fallback: string) => (t(key) === key ? fallback : t(key));

export default function ImportWizard({ eventId, guardianSlots }: { eventId: string; guardianSlots: number }) {
  const { t } = useTranslations();
  const [data, setData] = useState<Data | null>(null);
  const [reload, setReload] = useState(0);
  const [step, setStep] = useState(0);
  const [table, setTable] = useState<Table | null>(null);
  const [syncId, setSyncId] = useState<string | null>(null);
  const [source, setSource] = useState<{ sheetId: string; tab?: string; name: string; autoSync: boolean; everyHours: number } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [matchBy, setMatchBy] = useState(MATCH_BY_NAME);
  const [onNew, setOnNew] = useState<OnNew>("create");
  const [valueMap, setValueMap] = useState<Record<string, Record<string, string>>>({});
  const [mergeInto, setMergeInto] = useState<Record<string, string>>({});
  const [excluded, setExcluded] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>({});
  const [policy, setPolicy] = useState<ImportPolicy>({ all: "keep" });
  const [plan, setPlan] = useState<{ plan: PlanRow[]; counts: Record<string, number> } | null>(null);
  const [conflicts, setConflicts] = useState<PlanRow[] | null>(null);
  const [result, setResult] = useState<{ runId: string; counts: Record<string, number> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    fetch(`/api/events/${eventId}/imports`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Data) => !gone && setData(d))
      .catch(() => !gone && setError(t("fieldsManager.loadFailed")));
    return () => {
      gone = true;
    };
  }, [eventId, reload, t]);

  const fieldByKey = useMemo(() => new Map((data?.fields ?? []).map((f) => [f.key, f])), [data]);
  const settings = (p: ImportPolicy = policy) => ({ mapping, matchBy, onNew, onMatch: "fill", overrides, excluded, valueMap, policy: p, mergeInto });
  const post = async (body: object) => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/events/${eventId}/imports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    const json = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) setError(tOr(t, `fieldsManager.import.err.${(json as { error?: string }).error ?? "failed"}`, t("fieldsManager.err.failed")));
    return res?.ok ? json : null;
  };

  function loadTable(next: Table & { tab?: string }, sync: Sync | null, sheetId?: string) {
    const sheet = sync?.sheetId ?? sheetId;
    setSource(sheet ? { sheetId: sheet, tab: next.tab ?? sync?.tab, name: sync?.name ?? "", autoSync: sync?.autoSync ?? false, everyHours: sync?.everyHours ?? 6 } : null);
    const headers = next.headers.map((h) => h.trim());
    setTable({ headers, rows: next.rows });
    setSyncId(sync?.id ?? null);
    setMapping(slotMapping(headers, sync ? sync.mapping : guessMapping(headers, data!.fields)));
    setMatchBy(sync?.matchBy ?? MATCH_BY_NAME);
    setOnNew(sync?.onNew ?? "create");
    setValueMap(sync?.valueMap ?? {});
    setMergeInto(sync?.mergeInto ?? {});
    setExcluded(sync?.excluded ?? []);
    setOverrides(sync?.overrides ?? {});
    setPolicy(sync?.policy ?? { all: sync?.onMatch === "overwrite" ? "replace" : sync?.onMatch === "skip" ? "skip" : "keep" });
    setPlan(null);
    setConflicts(null);
    setResult(null);
    setStep(1);
  }

  async function goTo(i: number) {
    if (i >= 3 && table) {
      const p = await post({ action: "plan", table, settings: settings(), syncId });
      if (!p) return;
      setPlan(p);
      if (i === 4) {
        // What "replace" would change: values already filled that differ -- the cells to decide on.
        const all = await post({ action: "plan", table, settings: settings({ ...policy, all: "replace", byCategory: {}, byPerson: {}, byCell: {} }), syncId });
        setConflicts(all ? (all.plan as PlanRow[]).filter((r) => r.participant && r.changes.some((c) => c.from && c.field !== "guardian")) : []);
      }
    }
    setStep(i);
  }

  if (!data) return <p className="text-[13px] text-ink-secondary">{error ?? t("fieldsManager.loading")}</p>;
  const targets = [
    ...data.fields.filter((f) => isWritableField(f) && f.kind !== "guardian").map((f) => ({ key: f.key, label: f.label })),
    ...Array.from({ length: guardianSlots }, (_, i) =>
      ["name", "email", "phone", "relation"].map((p) => ({ key: `guardian${i + 1}_${p}`, label: t(`fieldsManager.import.guardian.${p}`, { n: String(i + 1) }) })),
    ).flat(),
  ];
  const sample = (c: number) => table?.rows.find((r) => (r[c] ?? "").trim())?.[c] ?? "";
  const nameCol = table ? table.headers.findIndex((h) => [NAME_FIELD, FIRST_NAME_FIELD, LAST_NAME_FIELD].includes(mapping[h])) : -1;

  return (
    <div className="space-y-4 text-[13px]">
      <ol className="flex flex-wrap gap-1">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" disabled={!table || busy || (i > 0 && !table)} onClick={() => goTo(i)} className={`rounded-full border px-3 py-1 ${i === step ? "border-ember bg-paper-2 font-medium" : "border-mist"} disabled:opacity-40`}>
              {i + 1}. {t(`fieldsManager.import.step.${s}`)}
            </button>
          </li>
        ))}
      </ol>
      {error && <p className="text-red-700">{error}</p>}

      {step === 0 && <SourceStep data={data} post={post} busy={busy} onTable={loadTable} onUndone={() => setReload((n) => n + 1)} eventId={eventId} />}

      {step === 1 && table && (
        <div className="space-y-2">
          <p className="text-ink-secondary">{t("fieldsManager.import.columnsHelp")}</p>
          <div className="max-h-[60vh] overflow-auto rounded-xl border border-mist">
            <table className="w-full">
              <tbody>
                {table.headers.map((h, c) => (
                  <tr key={h + c} className="border-b border-mist last:border-0">
                    <td className="p-2 font-medium">{h || `#${c + 1}`}</td>
                    <td className="max-w-[200px] truncate p-2 text-ink-secondary" title={sample(c)}>{sample(c)}</td>
                    <td className="p-2">→</td>
                    <td className="p-2">
                      <select value={mapping[h] ?? IGNORE} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })} className={input}>
                        <option value={IGNORE}>{t("fieldsManager.import.ignore")}</option>
                        {targets.map((x) => (
                          <option key={x.key} value={x.key}>{x.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      {(mapping[h] ?? IGNORE) === IGNORE && (
                        <NewFieldButton eventId={eventId} header={h} values={table.rows.map((r) => r[c] ?? "")} onCreated={(key) => {
                          setMapping({ ...mapping, [h]: key });
                          setReload((n) => n + 1);
                        }} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label>
              {t("fieldsManager.import.matchBy")}{" "}
              <select value={matchBy} onChange={(e) => setMatchBy(e.target.value)} className={input}>
                <option value={MATCH_BY_NAME}>{t("fieldsManager.import.matchByName")}</option>
                {data.fields.filter((f) => Object.values(mapping).includes(f.key) && f.kind === "custom").map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </label>
            <label>
              {t("fieldsManager.import.onNew")}{" "}
              <select value={onNew} onChange={(e) => setOnNew(e.target.value as OnNew)} className={input}>
                <option value="create">{t("fieldsManager.import.onNewCreate")}</option>
                <option value="report">{t("fieldsManager.import.onNewReport")}</option>
              </select>
            </label>
          </div>
          <Next onClick={() => goTo(2)} busy={busy} />
        </div>
      )}

      {step === 2 && table && (
        <ValuesStep table={table} mapping={mapping} fieldByKey={fieldByKey} valueMap={valueMap} setValueMap={setValueMap} nameCol={nameCol} onNext={() => goTo(3)} busy={busy} />
      )}

      {step === 3 && plan && (
        <div className="space-y-2">
          <Counts counts={plan.counts} />
          <div className="max-h-[60vh] overflow-auto rounded-xl border border-mist">
            <table className="w-full">
              <tbody>
                {plan.plan.map((r) => (
                  <tr key={r.rowNumber} className="border-b border-mist align-top last:border-0">
                    <td className="p-2 text-ink-secondary">{r.rowNumber}</td>
                    <td className="p-2">{nameCol >= 0 ? r.cells[nameCol] : r.rowKey}</td>
                    <td className="p-2">
                      <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[12px]">{t(`fieldsManager.import.status.${r.status}`)}</span>
                      {r.merged && <span className="ml-1 text-[12px] text-ember">{t("fieldsManager.import.merged")}</span>}
                      {[...r.errors, ...(r.warnings ?? [])].map((e) => (
                        <div key={e} className={r.errors.includes(e) ? "text-red-700" : "text-amber-700"}>{tOr(t, `fieldsManager.import.issue.${e}`, e)}</div>
                      ))}
                    </td>
                    <td className="p-2">
                      {r.participant && !r.merged ? (
                        r.participant.name
                      ) : r.status !== "excluded" ? (
                        <select value={mergeInto[r.rowKey] ?? ""} onChange={(e) => setMergeInto(Object.fromEntries(Object.entries({ ...mergeInto, [r.rowKey]: e.target.value }).filter(([, v]) => v)))} className={input}>
                          <option value="">{r.status === "create" ? t("fieldsManager.import.asNew") : "—"}</option>
                          {data.participants.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}{p.dateOfBirth ? ` (${p.dateOfBirth})` : ""}</option>
                          ))}
                        </select>
                      ) : null}
                    </td>
                    <td className="p-2">
                      <label className="whitespace-nowrap text-[12px]">
                        <input type="checkbox" checked={excluded.includes(r.rowKey)} onChange={(e) => setExcluded(e.target.checked ? [...excluded, r.rowKey] : excluded.filter((k) => k !== r.rowKey))} /> {t("fieldsManager.import.exclude")}
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => goTo(3)} className="rounded-lg border border-mist px-3 py-1">{t("fieldsManager.import.recheck")}</button>
            <Next onClick={() => goTo(4)} busy={busy} />
          </div>
        </div>
      )}

      {step === 4 && conflicts && (
        <ExistingStep conflicts={conflicts} fieldByKey={fieldByKey} policy={policy} setPolicy={setPolicy} nameCol={nameCol} onNext={() => goTo(5)} busy={busy} />
      )}

      {step === 5 && plan && (
        <div className="space-y-3">
          {result ? (
            <>
              <p className="font-medium">{t("fieldsManager.import.done")}</p>
              <Counts counts={result.counts} />
              <UndoButton eventId={eventId} runId={result.runId} onDone={() => {
                  setResult(null);
                  setReload((n) => n + 1);
                  setStep(0);
                }} />
              {source && <SaveConnection source={source} setSource={setSource} save={async () => {
                const r = await post({ action: "save", syncId, ...source, settings: settings() });
                if (r) setSyncId((r as { syncId: string }).syncId);
                return !!r;
              }} />}
            </>
          ) : (
            <>
              <Counts counts={plan.counts} />
              <p className="text-ink-secondary">{t("fieldsManager.import.applyHelp")}</p>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const r = await post({ action: "apply", table, settings: settings(), syncId });
                  if (r) setResult(r);
                }}
                className="rounded-lg bg-ember px-4 py-1.5 text-white disabled:opacity-40"
              >
                {busy ? t("fieldsManager.loading") : t("fieldsManager.import.apply")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

type Source = { sheetId: string; tab?: string; name: string; autoSync: boolean; everyHours: number };
/** Phase 5: keep the choices as a connection, optionally synced automatically (uncertain rows go to "Ke kontrole"). */
function SaveConnection({ source, setSource, save }: { source: Source; setSource: (s: Source) => void; save: () => Promise<boolean> }) {
  const { t } = useTranslations();
  const [saved, setSaved] = useState(false);
  return (
    <section className="space-y-2 rounded-xl border border-mist p-3">
      <h3 className="font-semibold">{t("fieldsManager.import.saveTitle")}</h3>
      <p className="text-ink-secondary">{t("fieldsManager.import.saveHelp")}</p>
      <input value={source.name} onChange={(e) => setSource({ ...source, name: e.target.value })} placeholder={t("fieldsManager.import.saveName")} className={`${input} w-full max-w-sm`} />
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={source.autoSync} onChange={(e) => setSource({ ...source, autoSync: e.target.checked })} />
        {t("fieldsManager.import.autoSync")}
        <select value={source.everyHours} disabled={!source.autoSync} onChange={(e) => setSource({ ...source, everyHours: Number(e.target.value) })} className={input}>
          {SYNC_INTERVALS.map((h) => (
            <option key={h} value={h}>{t("fieldsManager.everyHours", { n: String(h) })}</option>
          ))}
        </select>
      </label>
      <button type="button" disabled={!source.name.trim()} onClick={async () => setSaved(await save())} className="rounded-lg bg-ember px-3 py-1 text-white disabled:opacity-40">
        {t("fieldsManager.import.save")}
      </button>
      {saved && <span className="ml-2 text-ink-secondary">{t("fieldsManager.import.saved2")}</span>}
    </section>
  );
}

function Next({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  const { t } = useTranslations();
  return (
    <button type="button" disabled={busy} onClick={onClick} className="rounded-lg bg-ember px-3 py-1 text-white disabled:opacity-40">
      {busy ? t("fieldsManager.loading") : t("fieldsManager.import.next")}
    </button>
  );
}

function Counts({ counts }: { counts: Record<string, number> }) {
  const { t } = useTranslations();
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(counts).map(([k, n]) => (
        <span key={k} className="rounded-full border border-mist px-2.5 py-0.5 text-[12px]">
          {tOr(t, `fieldsManager.import.status.${k}`, k)}: {n}
        </span>
      ))}
    </div>
  );
}

function UndoButton({ eventId, runId, onDone }: { eventId: string; runId: string; onDone: () => void }) {
  const { t } = useTranslations();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={async () => {
          if (!confirm(t("fieldsManager.import.undoConfirm"))) return;
          const res = await fetch(`/api/events/${eventId}/imports/${runId}/undo`, { method: "POST" }).catch(() => null);
          const j = res ? await res.json().catch(() => ({})) : {};
          if (!res?.ok) return setMsg(t("fieldsManager.err.failed"));
          setMsg(t("fieldsManager.import.undone", { n: String(j.undone), kept: String(j.kept) }));
          setTimeout(onDone, 1500);
        }}
        className="rounded-lg border border-mist px-3 py-1 hover:bg-paper-2"
      >
        {t("fieldsManager.import.undo")}
      </button>
      {msg && <span className="text-ink-secondary">{msg}</span>}
    </span>
  );
}

function SourceStep({ data, post, busy, onTable, onUndone, eventId }: { data: Data; post: (b: object) => Promise<(Table & { tab?: string }) | null>; busy: boolean; onTable: (t: Table & { tab?: string }, s: Sync | null, sheetId?: string) => void; onUndone: () => void; eventId: string }) {
  const { t } = useTranslations();
  const [sheet, setSheet] = useState("");
  const [text, setText] = useState("");
  const fromText = (s: string) => {
    const [headers = [], ...rows] = parseTable(s);
    if (headers.length) onTable({ headers, rows }, null);
  };
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <section className="space-y-2 rounded-xl border border-mist p-3">
        <h3 className="font-semibold">{t("fieldsManager.import.saved")}</h3>
        {data.syncs.length === 0 && <p className="text-ink-secondary">{t("fieldsManager.noSources")}</p>}
        {data.syncs.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={busy || !s.sheetId}
            onClick={async () => {
              const table = await post({ action: "read", sheetId: s.sheetId, tab: s.tab });
              if (table) onTable(table, s);
            }}
            className="block w-full rounded-lg border border-mist px-2 py-1 text-left hover:bg-paper-2"
          >
            {s.name}
          </button>
        ))}
      </section>
      <section className="space-y-2 rounded-xl border border-mist p-3">
        <h3 className="font-semibold">{t("fieldsManager.import.sheet")}</h3>
        <input value={sheet} onChange={(e) => setSheet(e.target.value)} placeholder="https://docs.google.com/spreadsheets/…" className={`${input} w-full`} />
        <button
          type="button"
          disabled={busy || !sheet.trim()}
          onClick={async () => {
            const table = await post({ action: "read", sheetId: sheet.trim() });
            if (table) onTable(table, null, sheet.trim());
          }}
          className="rounded-lg bg-ember px-3 py-1 text-white disabled:opacity-40"
        >
          {t("fieldsManager.import.read")}
        </button>
      </section>
      <section className="space-y-2 rounded-xl border border-mist p-3">
        <h3 className="font-semibold">{t("fieldsManager.import.paste")}</h3>
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} className={`${input} w-full font-mono`} />
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!text.trim()} onClick={() => fromText(text)} className="rounded-lg bg-ember px-3 py-1 text-white disabled:opacity-40">
            {t("fieldsManager.import.usePaste")}
          </button>
          <label className="cursor-pointer rounded-lg border border-mist px-3 py-1 hover:bg-paper-2">
            {t("fieldsManager.import.file")}
            <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={async (e) => e.target.files?.[0] && fromText(await e.target.files[0].text())} />
          </label>
        </div>
      </section>
      {data.runs.length > 0 && (
        <section className="space-y-1 md:col-span-3">
          <h3 className="font-semibold">{t("fieldsManager.import.recent")}</h3>
          {data.runs.map((r) => (
            <div key={r.id} className="flex items-center gap-3">
              <span>{new Date(r.createdAt).toLocaleString()}</span>
              <span className="text-ink-secondary">{t("fieldsManager.import.writes", { n: String(r.writes) })}</span>
              {r.undoneAt ? <span className="text-ink-secondary">{t("fieldsManager.import.wasUndone")}</span> : <UndoButton eventId={eventId} runId={r.id} onDone={onUndone} />}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function NewFieldButton({ eventId, header, values, onCreated }: { eventId: string; header: string; values: string[]; onCreated: (key: string) => void }) {
  const { t } = useTranslations();
  const [err, setErr] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const g = guessType(values);
        const key = slugKey(header);
        const res = await fetch("/api/fields", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: eventId, label: header, key, fieldType: g.fieldType, options: g.options }) }).catch(() => null);
        if (res?.ok) onCreated(key);
        else setErr(true);
      }}
      className={`rounded border px-2 py-0.5 text-[12px] ${err ? "border-red-400 text-red-700" : "border-dashed border-mist hover:bg-paper-2"}`}
      title={t("fieldsManager.import.newFieldHelp")}
    >
      {err ? t("fieldsManager.err.failed") : t("fieldsManager.import.newField")}
    </button>
  );
}

/** Values the field won't take as they are (choice / yes-no fields): pick what each one means, with context rows. */
function ValuesStep({ table, mapping, fieldByKey, valueMap, setValueMap, nameCol, onNext, busy }: { table: Table; mapping: Record<string, string>; fieldByKey: Map<string, Field>; valueMap: Record<string, Record<string, string>>; setValueMap: (v: Record<string, Record<string, string>>) => void; nameCol: number; onNext: () => void; busy: boolean }) {
  const { t } = useTranslations();
  const columns = table.headers
    .map((h, c) => ({ h, c, f: fieldByKey.get(mapping[h]) }))
    .filter((x): x is { h: string; c: number; f: Field } => !!x.f && CHOICE_TYPES.has(x.f.fieldType ?? ""))
    .map(({ h, c, f }) => {
      const opts = Array.isArray(f.options) ? f.options.filter((o): o is string => typeof o === "string") : [];
      const ok = (v: string) =>
        f.fieldType === "boolean" || f.fieldType === "consent" ? toBoolean(v, f.options) !== null : f.fieldType === "multi" ? v.split(/\s*[,;\n]\s*/).every((p) => opts.includes(p)) : opts.includes(v);
      const rowsOf = new Map<string, number[]>();
      table.rows.forEach((r, i) => {
        const v = (r[c] ?? "").trim();
        if (v && !ok(v)) rowsOf.set(v, [...(rowsOf.get(v) ?? []), i]);
      });
      return { h, f, opts, unknown: [...rowsOf.entries()] };
    })
    .filter((x) => x.unknown.length);
  // Multi values written "A, B" are stored one per line -- translated without asking.
  useEffect(() => {
    const auto: Record<string, Record<string, string>> = {};
    table.headers.forEach((h, c) => {
      const f = fieldByKey.get(mapping[h]);
      if (f?.fieldType !== "multi") return;
      const opts = Array.isArray(f.options) ? f.options : [];
      for (const r of table.rows) {
        const v = (r[c] ?? "").trim();
        const parts = v.split(/\s*[,;]\s*/);
        if (parts.length > 1 && parts.every((p) => opts.includes(p))) (auto[h] ??= {})[v] = parts.join("\n");
      }
    });
    if (Object.keys(auto).length) setValueMap(Object.fromEntries([...new Set([...Object.keys(valueMap), ...Object.keys(auto)])].map((h) => [h, { ...auto[h], ...valueMap[h] }])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = (h: string, from: string, to: string) => {
    const col = { ...valueMap[h] };
    if (to) col[from] = to;
    else delete col[from];
    setValueMap({ ...valueMap, [h]: col });
  };
  return (
    <div className="space-y-3">
      {columns.length === 0 && <p className="text-ink-secondary">{t("fieldsManager.import.valuesNone")}</p>}
      {columns.map(({ h, f, opts, unknown }) => (
        <section key={h} className="rounded-xl border border-mist p-3">
          <h3 className="mb-2 font-semibold">{h} → {f.label}</h3>
          {unknown.map(([v, rows]) => (
            <div key={v} className="flex flex-wrap items-center gap-2 border-b border-mist py-1 last:border-0">
              <span className="min-w-[120px] font-mono">{v}</span>
              <span>→</span>
              <select value={valueMap[h]?.[v] ?? ""} onChange={(e) => set(h, v, e.target.value)} className={input}>
                <option value="">{t("fieldsManager.import.keepAsIs")}</option>
                {f.fieldType === "boolean" || f.fieldType === "consent" ? (
                  <>
                    <option value="true">{t("fieldsManager.yes")}</option>
                    <option value="false">{t("fieldsManager.no")}</option>
                  </>
                ) : (
                  opts.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))
                )}
              </select>
              <span className="text-[12px] text-ink-secondary">
                {rows.slice(0, 3).map((i) => (
                  <span key={i} title={table.rows[i].join(" | ")} className="mr-2 underline decoration-dotted">
                    {t("fieldsManager.import.row", { n: String(i + 2) })}{nameCol >= 0 ? `: ${table.rows[i][nameCol]}` : ""}
                  </span>
                ))}
                {rows.length > 3 && `+${rows.length - 3}`}
              </span>
            </div>
          ))}
        </section>
      ))}
      <Next onClick={onNext} busy={busy} />
    </div>
  );
}

/** Values already filled that the table would change: keep or replace -- for all, a section, a person, one cell. */
function ExistingStep({ conflicts, fieldByKey, policy, setPolicy, nameCol, onNext, busy }: { conflicts: PlanRow[]; fieldByKey: Map<string, Field>; policy: ImportPolicy; setPolicy: (p: ImportPolicy) => void; nameCol: number; onNext: () => void; busy: boolean }) {
  const { t } = useTranslations();
  const sections = [...new Set(conflicts.flatMap((r) => r.changes.map((c) => fieldByKey.get(c.field)?.section).filter((s): s is string => !!s)))];
  const modeSelect = (value: string, onChange: (v: string) => void, withSkip: boolean, withDefault: boolean) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={input}>
      {withDefault && <option value="">{t("fieldsManager.import.mode.default")}</option>}
      <option value="keep">{t("fieldsManager.import.mode.keep")}</option>
      <option value="replace">{t("fieldsManager.import.mode.replace")}</option>
      {withSkip && <option value="skip">{t("fieldsManager.import.mode.skip")}</option>}
    </select>
  );
  const setIn = <K extends "byCategory" | "byPerson">(k: K, key: string, v: string) =>
    setPolicy({ ...policy, [k]: Object.fromEntries(Object.entries({ ...policy[k], [key]: v }).filter(([, x]) => x)) });
  const setCell = (pid: string, field: string, v: string) => {
    const row = Object.fromEntries(Object.entries({ ...policy.byCell?.[pid], [field]: v }).filter(([, x]) => x)) as Record<string, FieldMode>;
    setPolicy({ ...policy, byCell: { ...policy.byCell, [pid]: row } });
  };
  return (
    <div className="space-y-3">
      <p className="text-ink-secondary">{t("fieldsManager.import.existingHelp")}</p>
      <label className="block">
        {t("fieldsManager.import.forAll")} {modeSelect(policy.all, (v) => setPolicy({ ...policy, all: v as ImportPolicy["all"] }), true, false)}
      </label>
      {sections.map((s) => (
        <label key={s} className="block">
          {t("fieldsManager.import.forSection", { s })} {modeSelect(policy.byCategory?.[s] ?? "", (v) => setIn("byCategory", s, v), false, true)}
        </label>
      ))}
      {conflicts.length === 0 && <p className="text-ink-secondary">{t("fieldsManager.import.noConflicts")}</p>}
      {conflicts.map((r) => (
        <section key={r.rowNumber} className="rounded-xl border border-mist p-3">
          <div className="mb-1 flex items-center gap-2 font-medium">
            {r.participant!.name}
            {nameCol >= 0 && r.cells[nameCol] !== r.participant!.name && <span className="text-ink-secondary">({r.cells[nameCol]})</span>}
            <span className="ml-auto">{modeSelect(policy.byPerson?.[r.participant!.id] ?? "", (v) => setIn("byPerson", r.participant!.id, v), true, true)}</span>
          </div>
          {r.changes.filter((c) => c.from && c.field !== "guardian").map((c) => (
            <div key={c.field} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2 border-t border-mist py-1">
              <span>{fieldByKey.get(c.field)?.label ?? c.field}</span>
              <span className="text-ink-secondary line-through decoration-ember/40">{c.from}</span>
              <span>{c.to}</span>
              {modeSelect(policy.byCell?.[r.participant!.id]?.[c.field] ?? "", (v) => setCell(r.participant!.id, c.field, v), false, true)}
            </div>
          ))}
        </section>
      ))}
      <Next onClick={onNext} busy={busy} />
    </div>
  );
}
