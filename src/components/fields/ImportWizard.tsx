"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "@/lib/i18n";
import { parseTable } from "@/lib/planning-import";
import { toBoolean } from "@/lib/participant-fields";
import {
  canCreate,
  guessMapping,
  guessType,
  slotMapping,
  SYNC_INTERVALS,
  isWritableField,
  IGNORE,
  MATCH_BY_NAME,
  REGNUM_TARGET,
  NAME_FIELD,
  FIRST_NAME_FIELD,
  LAST_NAME_FIELD,
  type FieldInfo,
  type FieldMode,
  type ImportPolicy,
  type OnNew,
} from "@/lib/participant-sync";
import { slugKey } from "./FieldEditors";

// The import (Fields Manager phase 4, redesign R1–R6): 1 Zdroj -> 2 Sloupce (+ preview table) -> 3 Hodnoty (keep /
// replace / don't change + value translation + finer levels) -> 4 Lidé -> 5 Import (connection settings, schedule,
// "mark document received", sync). A saved connection is already set up: sync it straight from Zdroj; its settings
// open only on "Nastavení". Every choice is the connection's settings; the server plans exactly what it writes.
type Table = { headers: string[]; rows: string[][] };
type Field = FieldInfo & { section: string | null };
type LastSync = { at: string; auto: boolean; counts: Record<string, number>; error?: { code: string } };
type Sync = { id: string; name: string; sheetId: string; tab?: string; autoSync?: boolean; everyHours?: number; markDocumentId?: string; lastSync?: LastSync; mapping: Record<string, string>; matchBy: string; onNew: OnNew; onMatch: string; valueMap?: Record<string, Record<string, string>>; policy?: ImportPolicy; mergeInto?: Record<string, string>; excluded: string[]; overrides: Record<string, Record<string, string>> };
type Person = { id: string; name: string; dateOfBirth: string | null };
type Run = { id: string; createdAt: string; undoneAt: string | null; writes: number };
type PlanRow = { rowNumber: number; rowKey: string; cells: string[]; status: string; errors: string[]; warnings?: string[]; merged?: boolean; participant: { id: string; name: string } | null; changes: { field: string; from: string; to: string }[] };
type Data = { syncs: Sync[]; fields: Field[]; participants: Person[]; runs: Run[]; docTypes: { id: string; name: string }[]; guardianSlots: number };
type Conn = { name: string; autoSync: boolean; everyHours: number; markDocumentId: string; sheetId: string; tab?: string };

const STEPS = ["source", "columns", "values", "people", "apply"] as const;
const input = "rounded border border-mist bg-paper px-2 py-1 text-[13px]";
const CHOICE_TYPES = new Set(["select", "multi", "boolean", "consent"]);
const PROBLEMS = new Set(["error", "unmatched", "seen_missing"]);
/** A translation, or `fallback` when the key has none (t returns the key itself then). */
const tOr = (t: (k: string) => string, key: string, fallback: string) => (t(key) === key ? fallback : t(key));
const policyFromOnMatch = (onMatch?: string): ImportPolicy => ({ all: onMatch === "overwrite" ? "replace" : onMatch === "skip" ? "skip" : "keep" });
const settingsOf = (s: Sync) => ({ mapping: s.mapping, matchBy: s.matchBy, onNew: s.onNew, onMatch: s.onMatch, overrides: s.overrides, excluded: s.excluded, valueMap: s.valueMap, policy: s.policy ?? policyFromOnMatch(s.onMatch), mergeInto: s.mergeInto });

export default function ImportWizard({ eventId }: { eventId: string }) {
  const { t, role } = useTranslations();
  const [data, setData] = useState<Data | null>(null);
  const [reload, setReload] = useState(0);
  const [step, setStep] = useState(0);
  const [table, setTable] = useState<Table | null>(null);
  const [syncId, setSyncId] = useState<string | null>(null);
  const [conn, setConn] = useState<Conn | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [matchBy, setMatchBy] = useState(MATCH_BY_NAME);
  const [onNew, setOnNew] = useState<OnNew>("create");
  const [valueMap, setValueMap] = useState<Record<string, Record<string, string>>>({});
  const [mergeInto, setMergeInto] = useState<Record<string, string>>({});
  const [excluded, setExcluded] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>({});
  const [policy, setPolicy] = useState<ImportPolicy>({ all: "keep" });
  const [markDocumentId, setMarkDocumentId] = useState("");
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
  const settings = (p: ImportPolicy = policy) => ({ mapping, matchBy, onNew, onMatch: p.all === "replace" ? "overwrite" : p.all === "skip" ? "skip" : "fill", overrides, excluded, valueMap, policy: p, mergeInto });
  const post = async (body: object, quiet = false) => {
    if (!quiet) setBusy(true);
    setError(null);
    const res = await fetch(`/api/events/${eventId}/imports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (!quiet) setBusy(false);
    const json = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) setError(tOr(t, `fieldsManager.import.err.${(json as { error?: string }).error ?? "failed"}`, t("fieldsManager.err.failed")));
    return res?.ok ? json : null;
  };

  // The preview follows every choice (steps 2–5), a moment after the last change.
  const planKey = JSON.stringify([table?.rows.length, mapping, matchBy, onNew, overrides, excluded, valueMap, policy, mergeInto]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!table || step === 0 || result) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const p = await post({ action: "plan", table, settings: settings(), syncId }, true);
      if (p) setPlan(p);
    }, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey, step]);

  function loadTable(next: Table & { tab?: string }, sync: Sync | null, sheetId?: string) {
    const sheet = sync?.sheetId ?? sheetId;
    setConn(sheet ? { sheetId: sheet, tab: next.tab ?? sync?.tab, name: sync?.name ?? "", autoSync: sync?.autoSync ?? false, everyHours: sync?.everyHours ?? 6, markDocumentId: sync?.markDocumentId ?? "" } : null);
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
    setPolicy(sync?.policy ?? policyFromOnMatch(sync?.onMatch));
    setMarkDocumentId(sync?.markDocumentId ?? "");
    setPlan(null);
    setConflicts(null);
    setResult(null);
    setStep(1);
  }

  async function goTo(i: number) {
    if (i === 2 && table) {
      // What "replace" would change: values already filled that differ -- for the finer choices in Hodnoty.
      const all = await post({ action: "plan", table, settings: settings({ ...policy, all: "replace", byCategory: {}, byPerson: {}, byCell: {} }), syncId });
      setConflicts(all ? (all.plan as PlanRow[]).filter((r) => r.participant && r.changes.some((c) => c.from && c.field !== "guardian")) : []);
    }
    setStep(i);
  }

  async function saveConnection(): Promise<string | null> {
    if (!conn) return null;
    const res = await fetch(`/api/events/${eventId}/participants/syncs/${syncId ?? "new"}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...settings(), name: conn.name, sheetId: conn.sheetId, tab: conn.tab, autoSync: conn.autoSync, everyHours: conn.everyHours, markDocumentId: markDocumentId || undefined }),
    }).catch(() => null);
    if (!res?.ok) {
      setError(t("participantSync.saveFailed"));
      return null;
    }
    const saved = (await res.json()) as { id: string };
    setSyncId(saved.id);
    setReload((n) => n + 1);
    return saved.id;
  }

  if (!data) return <p className="text-[13px] text-ink-secondary">{error ?? t("fieldsManager.loading")}</p>;
  const targets = [
    ...data.fields.filter((f) => isWritableField(f) && f.kind !== "guardian").map((f) => ({ key: f.key, label: f.label })),
    ...Array.from({ length: data.guardianSlots }, (_, i) =>
      ["name", "email", "phone", "relation"].map((p) => ({ key: `guardian${i + 1}_${p}`, label: t(`fieldsManager.import.guardian.${p}`, { n: String(i + 1) }) })),
    ).flat(),
    // Match-only targets (as on the old page): the registration number, computed fields like the variable symbol.
    { key: REGNUM_TARGET, label: `${t("participantSync.regNumber")} (${t("participantSync.matchOnly")})` },
    ...data.fields.filter((f) => !isWritableField(f) && f.kind !== "guardian").map((f) => ({ key: f.key, label: `${f.label} (${t("participantSync.matchOnly")})` })),
  ];
  const matchOptions = [
    { key: MATCH_BY_NAME, label: t("participantSync.matchByName") },
    { key: REGNUM_TARGET, label: t("participantSync.regNumber") },
    ...data.fields.filter((f) => f.kind !== "guardian").map((f) => ({ key: f.key, label: isWritableField(f) ? f.label : `${f.label} (${t("participantSync.matchOnly")})` })),
  ];
  const creatable = canCreate(matchBy, data.fields);
  const sample = (c: number) => table?.rows.find((r) => (r[c] ?? "").trim())?.[c] ?? "";
  const nameCol = table ? table.headers.findIndex((h) => [NAME_FIELD, FIRST_NAME_FIELD, LAST_NAME_FIELD].includes(mapping[h])) : -1;
  const labelOf = (k: string) => fieldByKey.get(k)?.label ?? targets.find((x) => x.key === k)?.label ?? k;
  const preview = (extra?: { header: string; cell: (r: PlanRow) => ReactNode }) =>
    table && <PlanTable plan={plan} headers={table.headers} mapping={mapping} labelOf={labelOf} excluded={excluded} setExcluded={setExcluded} overrides={overrides} setOverrides={setOverrides} extra={extra} />;

  return (
    <div className="space-y-4 text-[13px]">
      <ol className="flex flex-wrap gap-1">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" disabled={busy || (i > 0 && !table)} onClick={() => goTo(i)} className={`rounded-full border px-3 py-1 ${i === step ? "border-ember bg-paper-2 font-medium" : "border-mist"} disabled:opacity-40`}>
              {i + 1}. {t(`fieldsManager.import.step.${s}`)}
            </button>
          </li>
        ))}
      </ol>
      {error && <p className="text-red-700">{error}</p>}

      {step === 0 && <SourceStep data={data} eventId={eventId} post={post} busy={busy} onTable={loadTable} onChanged={() => setReload((n) => n + 1)} />}

      {step === 1 && table && (
        <div className="space-y-3">
          <p className="text-ink-secondary">{t("fieldsManager.import.columnsHelp")}</p>
          <div className="max-h-[45vh] overflow-auto rounded-xl border border-mist">
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
                      {role === "admin" && (mapping[h] ?? IGNORE) === IGNORE && (
                        <NewFieldButton
                          eventId={eventId}
                          header={h}
                          values={table.rows.map((r) => r[c] ?? "")}
                          onCreated={(key) => {
                            setMapping({ ...mapping, [h]: key });
                            setReload((n) => n + 1);
                          }}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[12px] text-ink-secondary">
              {t("participantSync.matchBy")}
              <select value={matchBy} onChange={(e) => {
                setMatchBy(e.target.value);
                if (!canCreate(e.target.value, data.fields)) setOnNew("report");
              }} className={input}>
                {matchOptions.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
              <span>{t("participantSync.matchByHint")}</span>
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-ink-secondary">
              {t("participantSync.onNew")}
              <select value={onNew} onChange={(e) => setOnNew(e.target.value as OnNew)} className={input}>
                <option value="create" disabled={!creatable}>{t("participantSync.onNew.create")}</option>
                <option value="report">{t("participantSync.onNew.report")}</option>
              </select>
              {!creatable && <span>{t("participantSync.regNumberNoCreate")}</span>}
            </label>
          </div>
          {preview()}
          <Next onClick={() => goTo(2)} busy={busy} />
        </div>
      )}

      {step === 2 && table && (
        <div className="space-y-3">
          <section className="space-y-1 rounded-xl border border-mist p-3">
            <h3 className="font-semibold">{t("fieldsManager.import.existingTitle")}</h3>
            <div className="flex flex-wrap gap-3">
              {(["keep", "replace", "skip"] as const).map((m) => (
                <label key={m} className="flex items-center gap-1">
                  <input type="radio" checked={policy.all === m} onChange={() => setPolicy({ ...policy, all: m })} />
                  {t(`participantSync.onMatch.${m === "keep" ? "fill" : m === "replace" ? "overwrite" : "skip"}`)}
                </label>
              ))}
            </div>
            {conflicts && conflicts.length > 0 && (
              <details className="pt-1">
                <summary className="cursor-pointer text-ember">{t("fieldsManager.import.finer", { n: String(conflicts.length) })}</summary>
                <ExistingDetails conflicts={conflicts} fieldByKey={fieldByKey} policy={policy} setPolicy={setPolicy} nameCol={nameCol} />
              </details>
            )}
          </section>
          <ValueTranslation table={table} mapping={mapping} fieldByKey={fieldByKey} valueMap={valueMap} setValueMap={setValueMap} nameCol={nameCol} />
          {preview()}
          <Next onClick={() => goTo(3)} busy={busy} />
        </div>
      )}

      {step === 3 && table && (
        <div className="space-y-2">
          <p className="text-ink-secondary">{t("fieldsManager.import.peopleHelp")}</p>
          {preview({
            header: t("fieldsManager.import.who"),
            cell: (r) =>
              r.participant && !r.merged ? (
                r.participant.name
              ) : r.status !== "excluded" ? (
                <select value={mergeInto[r.rowKey] ?? ""} onChange={(e) => setMergeInto(Object.fromEntries(Object.entries({ ...mergeInto, [r.rowKey]: e.target.value }).filter(([, v]) => v)))} className={input}>
                  <option value="">{r.status === "create" ? t("fieldsManager.import.asNew") : "—"}</option>
                  {data.participants.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.dateOfBirth ? ` (${p.dateOfBirth})` : ""}</option>
                  ))}
                </select>
              ) : null,
          })}
          <Next onClick={() => goTo(4)} busy={busy} />
        </div>
      )}

      {step === 4 && table && (
        <div className="space-y-3">
          {result ? (
            <>
              <p className="font-medium">{t("fieldsManager.import.done")}</p>
              <Counts counts={result.counts} />
              <UndoButton
                eventId={eventId}
                runId={result.runId}
                onDone={() => {
                  setResult(null);
                  setReload((n) => n + 1);
                  setStep(0);
                }}
              />
            </>
          ) : (
            <>
              {plan && <Counts counts={plan.counts} />}
              <ConnectionSettings conn={conn} setConn={setConn} docTypes={data.docTypes} markDocumentId={markDocumentId} setMarkDocumentId={setMarkDocumentId} saved={!!syncId} onSave={saveConnection} />
              <p className="text-ink-secondary">{t("fieldsManager.import.applyHelp")}</p>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const r = await post({ action: "apply", table, settings: settings(), syncId, markDocumentId: markDocumentId || undefined });
                  if (r) setResult(r);
                }}
                className="rounded-lg bg-ember px-4 py-1.5 text-white disabled:opacity-40"
              >
                {busy ? t("fieldsManager.loading") : syncId ? t("participantSync.saveAndSync") : t("fieldsManager.import.apply")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** The plan as a table (redesign R3, like the old import page): mapped columns, status, changes; filter; skip a row;
 * click a cell to fix its value (kept on the connection, the sheet itself is never written). */
function PlanTable({ plan, headers, mapping, labelOf, excluded, setExcluded, overrides, setOverrides, extra }: { plan: { plan: PlanRow[]; counts: Record<string, number> } | null; headers: string[]; mapping: Record<string, string>; labelOf: (k: string) => string; excluded: string[]; setExcluded: (v: string[]) => void; overrides: Record<string, Record<string, string>>; setOverrides: (v: Record<string, Record<string, string>>) => void; extra?: { header: string; cell: (r: PlanRow) => ReactNode } }) {
  const { t } = useTranslations();
  const [filter, setFilter] = useState<"all" | "changes" | "problems">("all");
  const [limit, setLimit] = useState(200);
  const [editing, setEditing] = useState<{ rowKey: string; header: string; value: string } | null>(null);
  if (!plan) return <p className="text-ink-secondary">{t("fieldsManager.loading")}</p>;
  const cols = headers.map((h, i) => ({ h, i })).filter(({ h }) => mapping[h] && mapping[h] !== IGNORE);
  const shown = plan.plan.filter((r) => (filter === "all" ? true : filter === "changes" ? r.status === "create" || r.status === "update" : PROBLEMS.has(r.status)));
  const commit = () => {
    if (!editing) return;
    setOverrides({ ...overrides, [editing.rowKey]: { ...overrides[editing.rowKey], [editing.header]: editing.value } });
    setEditing(null);
  };
  return (
    <section className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{t("participantSync.previewTitle")}</h3>
        <Counts counts={plan.counts} />
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className={`${input} ml-auto`}>
          <option value="all">{t("participantSync.filter.all")}</option>
          <option value="changes">{t("participantSync.filter.changes")}</option>
          <option value="problems">{t("participantSync.filter.problems")}</option>
        </select>
      </div>
      <p className="text-[12px] text-ink-secondary">{t("participantSync.editHint")}</p>
      <div className="max-h-[55vh] overflow-auto rounded-xl border border-mist">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-paper">
            <tr className="border-b border-mist text-left text-[12px] text-ink-secondary">
              <th className="p-2" />
              <th className="p-2">#</th>
              <th className="p-2">{t("participantSync.result.status")}</th>
              {extra && <th className="p-2">{extra.header}</th>}
              {cols.map(({ h }) => (
                <th key={h} className="p-2" title={labelOf(mapping[h])}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, limit).map((r) => {
              const changed = new Set(r.changes.map((c) => c.field));
              return (
                <tr key={r.rowNumber} className={`border-b border-mist align-top ${r.status === "excluded" ? "opacity-50" : ""}`}>
                  <td className="p-2">
                    <input type="checkbox" checked={!excluded.includes(r.rowKey)} onChange={(e) => setExcluded(e.target.checked ? excluded.filter((k) => k !== r.rowKey) : [...excluded, r.rowKey])} />
                  </td>
                  <td className="p-2 text-ink-secondary">{r.rowNumber}</td>
                  <td className="p-2">
                    <span className="whitespace-nowrap rounded-full bg-paper-2 px-2 py-0.5 text-[12px]">{tOr(t, `fieldsManager.import.status.${r.status}`, r.status)}</span>
                    {r.merged && <div className="text-[12px] text-ember">{t("fieldsManager.import.merged")}</div>}
                    {[...r.errors, ...(r.warnings ?? [])].map((e) => (
                      <div key={e} className={`text-[12px] ${r.errors.includes(e) ? "text-red-700" : "text-amber-700"}`}>{tOr(t, `fieldsManager.import.issue.${e}`, e)}</div>
                    ))}
                  </td>
                  {extra && <td className="p-2">{extra.cell(r)}</td>}
                  {cols.map(({ h, i }) => {
                    const target = mapping[h];
                    const change = r.changes.find((c) => c.field === target);
                    const isEdited = overrides[r.rowKey]?.[h] !== undefined;
                    return (
                      <td key={h} className={`p-2 ${changed.has(target) ? "bg-amber-50" : ""} ${isEdited ? "italic" : ""}`} title={change?.from ? `${t("participantSync.originalValue")}: ${change.from}` : undefined} onClick={() => !editing && setEditing({ rowKey: r.rowKey, header: h, value: r.cells[i] ?? "" })}>
                        {editing?.rowKey === r.rowKey && editing.header === h ? (
                          <input autoFocus value={editing.value} onChange={(e) => setEditing({ ...editing, value: e.target.value })} onBlur={commit} onKeyDown={(e) => (e.key === "Enter" ? commit() : e.key === "Escape" ? setEditing(null) : undefined)} className={`${input} w-full`} />
                        ) : (
                          r.cells[i]
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {shown.length > limit && (
        <button type="button" onClick={() => setLimit(shown.length)} className="text-ember underline">
          {t("fieldsManager.import.showAll", { n: String(shown.length) })}
        </button>
      )}
    </section>
  );
}

/** Step 5: the connection's own settings (redesign R2, R4) -- name, schedule, document to tick as received. */
function ConnectionSettings({ conn, setConn, docTypes, markDocumentId, setMarkDocumentId, saved, onSave }: { conn: Conn | null; setConn: (c: Conn) => void; docTypes: { id: string; name: string }[]; markDocumentId: string; setMarkDocumentId: (v: string) => void; saved: boolean; onSave: () => Promise<string | null> }) {
  const { t } = useTranslations();
  const [ok, setOk] = useState(false);
  return (
    <section className="grid gap-3 rounded-xl border border-mist p-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-[12px] text-ink-secondary">
        {t("participantSync.markDocument")}
        <select value={markDocumentId} onChange={(e) => setMarkDocumentId(e.target.value)} className={input}>
          <option value="">{t("participantSync.markDocumentNone")}</option>
          {docTypes.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <span>{t("participantSync.markDocumentHint")}</span>
      </label>
      {conn && (
        <>
          <label className="flex flex-col gap-1 text-[12px] text-ink-secondary">
            {t("participantSync.name")}
            <input value={conn.name} onChange={(e) => setConn({ ...conn, name: e.target.value })} placeholder={t("participantSync.namePlaceholder")} className={input} />
          </label>
          <div className="flex flex-col gap-1 text-[12px] text-ink-secondary">
            {t("participantSync.auto")}
            <label className="flex items-center gap-2 text-[13px] text-ink">
              <input type="checkbox" checked={conn.autoSync} onChange={(e) => setConn({ ...conn, autoSync: e.target.checked })} />
              {t("participantSync.autoOn")}
              <select value={conn.everyHours} disabled={!conn.autoSync} onChange={(e) => setConn({ ...conn, everyHours: Number(e.target.value) })} className={`${input} disabled:opacity-50`}>
                {SYNC_INTERVALS.map((h) => (
                  <option key={h} value={h}>{t("participantSync.everyHours", { hours: String(h) })}</option>
                ))}
              </select>
            </label>
            <span>{t("fieldsManager.import.saveHelp")}</span>
          </div>
          <div className="flex items-end gap-2">
            <button type="button" onClick={async () => setOk(!!(await onSave()))} className="rounded-lg border border-mist px-3 py-1 hover:bg-paper-2">
              {saved ? t("fieldsManager.import.saveSettings") : t("fieldsManager.import.saveTitle")}
            </button>
            {ok && <span className="text-ink-secondary">{t("fieldsManager.import.saved2")}</span>}
          </div>
        </>
      )}
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
    <span className="inline-flex flex-wrap gap-1">
      {Object.entries(counts).map(([k, n]) => (
        <span key={k} className="rounded-full border border-mist px-2 py-0.5 text-[12px]">
          {tOr(t, `fieldsManager.import.status.${k}`, k)}: {n}
        </span>
      ))}
    </span>
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

/** Step 1 (redesign R2): saved connections are already set up -- sync, open the sheet, change settings, remove. */
function SourceStep({ data, eventId, post, busy, onTable, onChanged }: { data: Data; eventId: string; post: (b: object) => Promise<(Table & { tab?: string } & { counts?: Record<string, number> }) | null>; busy: boolean; onTable: (t: Table & { tab?: string }, s: Sync | null, sheetId?: string) => void; onChanged: () => void }) {
  const { t } = useTranslations();
  const [sheet, setSheet] = useState("");
  const [text, setText] = useState("");
  const [running, setRunning] = useState<string | null>(null);
  const [ran, setRan] = useState<Record<string, { counts: Record<string, number>; runId: string }>>({});
  const fromText = (s: string) => {
    const [headers = [], ...rows] = parseTable(s);
    if (headers.length) onTable({ headers, rows }, null);
  };
  const syncNow = async (s: Sync) => {
    setRunning(s.id);
    const table = await post({ action: "read", sheetId: s.sheetId, tab: s.tab });
    const r = table && (await post({ action: "apply", table: { headers: table.headers, rows: table.rows }, settings: settingsOf(s), syncId: s.id, markDocumentId: s.markDocumentId }));
    setRunning(null);
    if (r) {
      setRan({ ...ran, [s.id]: r as unknown as { counts: Record<string, number>; runId: string } });
      onChanged();
    }
  };
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-[15px] font-semibold">{t("participantSync.listTitle")}</h3>
        <p className="text-ink-secondary">{t("participantSync.listHint")}</p>
        {data.syncs.length === 0 && <p className="text-ink-secondary">{t("participantSync.none")}</p>}
        {data.syncs.map((s) => (
          <div key={s.id} className="space-y-1 rounded-xl border border-mist bg-paper-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold">{s.name}</span>
              {s.sheetId && (
                <a href={`https://docs.google.com/spreadsheets/d/${s.sheetId}`} target="_blank" rel="noreferrer" className="text-[12px] text-ember hover:underline">
                  {t("participantSync.openSheet")} ↗
                </a>
              )}
              <span className="ml-auto flex gap-2">
                <button type="button" disabled={busy || running !== null || !s.sheetId} onClick={() => syncNow(s)} className="rounded-lg bg-ember px-3 py-1 text-white disabled:opacity-50">
                  {running === s.id ? t("fieldsManager.loading") : t("participantSync.syncNow")}
                </button>
                <button
                  type="button"
                  disabled={busy || !s.sheetId}
                  onClick={async () => {
                    const table = await post({ action: "read", sheetId: s.sheetId, tab: s.tab });
                    if (table) onTable(table, s);
                  }}
                  className="rounded-lg border border-mist bg-paper px-3 py-1 hover:bg-paper-2"
                >
                  {t("participantSync.settings")}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(t("participantSync.confirmDelete", { name: s.name }))) return;
                    await fetch(`/api/events/${eventId}/participants/syncs/${s.id}`, { method: "DELETE" }).catch(() => null);
                    onChanged();
                  }}
                  className="rounded-lg px-2 py-1 text-red-600 hover:bg-red-50"
                >
                  {t("common.delete")}
                </button>
              </span>
            </div>
            <p className="text-[12px] text-ink-secondary">
              {s.autoSync ? t("participantSync.autoEvery", { hours: String(s.everyHours ?? 6) }) : t("participantSync.autoOff")}
              {" · "}
              {s.lastSync ? (
                <>
                  {t(s.lastSync.auto ? "participantSync.lastAuto" : "participantSync.lastManual", { at: new Date(s.lastSync.at).toLocaleString("cs-CZ") })}: <Counts counts={s.lastSync.counts} />
                </>
              ) : (
                t("participantSync.never")
              )}
            </p>
            {ran[s.id] && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{t("fieldsManager.import.done")}</span>
                <Counts counts={ran[s.id].counts} />
                <UndoButton eventId={eventId} runId={ran[s.id].runId} onDone={onChanged} />
              </div>
            )}
          </div>
        ))}
      </section>
      <div className="grid gap-4 md:grid-cols-2">
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
      </div>
      {data.runs.length > 0 && (
        <section className="space-y-1">
          <h3 className="font-semibold">{t("fieldsManager.import.recent")}</h3>
          {data.runs.map((r) => (
            <div key={r.id} className="flex items-center gap-3">
              <span>{new Date(r.createdAt).toLocaleString("cs-CZ")}</span>
              <span className="text-ink-secondary">{t("fieldsManager.import.writes", { n: String(r.writes) })}</span>
              {r.undoneAt ? <span className="text-ink-secondary">{t("fieldsManager.import.wasUndone")}</span> : <UndoButton eventId={eventId} runId={r.id} onDone={onChanged} />}
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
function ValueTranslation({ table, mapping, fieldByKey, valueMap, setValueMap, nameCol }: { table: Table; mapping: Record<string, string>; fieldByKey: Map<string, Field>; valueMap: Record<string, Record<string, string>>; setValueMap: (v: Record<string, Record<string, string>>) => void; nameCol: number }) {
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
    <section className="space-y-2 rounded-xl border border-mist p-3">
      <h3 className="font-semibold">{t("fieldsManager.import.translateTitle")}</h3>
      {columns.length === 0 && <p className="text-ink-secondary">{t("fieldsManager.import.valuesNone")}</p>}
      {columns.map(({ h, f, opts, unknown }) => (
        <div key={h}>
          <h4 className="font-medium">{h} → {f.label}</h4>
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
        </div>
      ))}
    </section>
  );
}

/** The finer levels under "Stávající hodnoty": per section, per person, per cell (most specific wins). */
function ExistingDetails({ conflicts, fieldByKey, policy, setPolicy, nameCol }: { conflicts: PlanRow[]; fieldByKey: Map<string, Field>; policy: ImportPolicy; setPolicy: (p: ImportPolicy) => void; nameCol: number }) {
  const { t } = useTranslations();
  const sections = [...new Set(conflicts.flatMap((r) => r.changes.map((c) => fieldByKey.get(c.field)?.section).filter((s): s is string => !!s)))];
  const modeSelect = (value: string, onChange: (v: string) => void, withSkip: boolean) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={input}>
      <option value="">{t("fieldsManager.import.mode.default")}</option>
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
    <div className="mt-2 space-y-2">
      <p className="text-ink-secondary">{t("fieldsManager.import.existingHelp")}</p>
      {sections.map((s) => (
        <label key={s} className="block">
          {t("fieldsManager.import.forSection", { s })} {modeSelect(policy.byCategory?.[s] ?? "", (v) => setIn("byCategory", s, v), false)}
        </label>
      ))}
      {conflicts.map((r) => (
        <div key={r.rowNumber} className="rounded-lg border border-mist p-2">
          <div className="mb-1 flex items-center gap-2 font-medium">
            {r.participant!.name}
            {nameCol >= 0 && r.cells[nameCol] !== r.participant!.name && <span className="text-ink-secondary">({r.cells[nameCol]})</span>}
            <span className="ml-auto">{modeSelect(policy.byPerson?.[r.participant!.id] ?? "", (v) => setIn("byPerson", r.participant!.id, v), true)}</span>
          </div>
          {r.changes.filter((c) => c.from && c.field !== "guardian").map((c) => (
            <div key={c.field} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2 border-t border-mist py-1">
              <span>{fieldByKey.get(c.field)?.label ?? c.field}</span>
              <span className="text-ink-secondary line-through decoration-ember/40">{c.from}</span>
              <span>{c.to}</span>
              {modeSelect(policy.byCell?.[r.participant!.id]?.[c.field] ?? "", (v) => setCell(r.participant!.id, c.field, v), false)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
