"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { driveErrorText } from "@/lib/drive-error-messages";
import {
  IGNORE,
  MATCH_BY_NAME,
  REGNUM_TARGET,
  SYNC_INTERVALS,
  canCreate,
  guessTarget,
  type FieldInfo,
  type PlanRow,
  type SyncSettings,
} from "@/lib/participant-sync";
import type { PublicSync } from "@/lib/participant-sync-run";

type Table = { headers: string[]; rows: string[][] };
type ViewRow = Omit<PlanRow, "create" | "patch">;
type Filter = "all" | "changes" | "problems";

const STATUS_CLASS: Record<string, string> = {
  create: "text-pine",
  update: "text-ember",
  unmatched: "text-amber-700",
  seen_missing: "text-amber-700",
  error: "text-red-600",
};
const PROBLEMS = new Set(["error", "unmatched", "seen_missing"]);
const COUNT_ORDER = ["create", "update", "same", "skip", "unmatched", "seen_missing", "superseded", "excluded", "error", "failed"];

export function CountsLine({ counts }: { counts: Record<string, number> }) {
  const { t } = useTranslations();
  const parts = COUNT_ORDER.filter((k) => counts[k]).map((k) => t(`participantSync.count.${k}`, { count: String(counts[k]) }));
  return <span>{parts.length ? parts.join(" · ") : t("participantSync.count.nothing")}</span>;
}

/**
 * One table connection (mode "sheet": saved, maybe new) or a one-off paste
 * (mode "paste"). Every change re-plans on the server, so the preview shows
 * exactly what the import/sync will do. Edited cells and unticked rows are
 * part of the settings -- saved with the connection and applied on every sync.
 */
export default function SyncEditor({
  eventId,
  mode,
  initial,
  fields,
  identityEmail,
  onClose,
}: {
  eventId: string;
  mode: "sheet" | "paste";
  initial: PublicSync | null;
  fields: FieldInfo[];
  identityEmail: string;
  onClose: (changed: boolean) => void;
}) {
  const { t } = useTranslations();
  const [name, setName] = useState(initial?.name ?? "");
  const [sheetInput, setSheetInput] = useState(initial?.sheetId ?? "");
  const [tab, setTab] = useState(initial?.tab);
  const [tabs, setTabs] = useState<string[]>([]);
  const [autoSync, setAutoSync] = useState(initial?.autoSync ?? false);
  const [everyHours, setEveryHours] = useState(initial?.everyHours ?? 6);
  const [settings, setSettings] = useState<SyncSettings>(
    initial
      ? { mapping: initial.mapping, matchBy: initial.matchBy, onNew: initial.onNew, onMatch: initial.onMatch, overrides: initial.overrides, excluded: initial.excluded }
      : { mapping: {}, matchBy: MATCH_BY_NAME, onNew: "create", onMatch: "fill", overrides: {}, excluded: [] }
  );
  const [pasteText, setPasteText] = useState("");
  const [table, setTable] = useState<Table | null>(null);
  const [plan, setPlan] = useState<ViewRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [editCell, setEditCell] = useState<{ rowKey: string; col: number; value: string } | null>(null);
  const requestNo = useRef(0);

  const patch = (p: Partial<SyncSettings>) => setSettings((s) => ({ ...s, ...p }));
  const fieldLabel = (key: string) =>
    key === "guardian" ? t("participantSync.guardian") : key === REGNUM_TARGET ? t("participantSync.regNumber") : (fields.find((f) => f.key === key)?.label ?? key);

  async function preview(opts: { reload?: boolean; tab?: string } = {}) {
    const no = ++requestNo.current;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/events/${eventId}/participants/syncs/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        syncId: initial?.id,
        sheetId: sheetInput,
        tab: opts.tab ?? tab,
        settings,
        table: opts.reload || !table ? undefined : table,
      }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    if (no !== requestNo.current) return; // a newer preview is on its way
    setLoading(false);
    if (!res?.ok || !data) {
      setError(data?.error ? driveErrorText(t, data.error, { identity: data.identity || identityEmail, serviceAccount: data.serviceAccount }) : t("participantImportPage.sheetsLoadError"));
      return;
    }
    if (opts.reload || !table) {
      setTable({ headers: data.headers, rows: data.rows });
      if (data.tabs) setTabs(data.tabs);
      if (data.tab) setTab(data.tab);
      guessMappingIfEmpty(data.headers);
    }
    setPlan(data.plan);
    setCounts(data.counts);
  }

  function guessMappingIfEmpty(headers: string[]) {
    setSettings((s) => {
      if (Object.keys(s.mapping).length > 0) return s;
      const mapping: Record<string, string> = {};
      for (const h of headers) {
        const g = guessTarget(h, fields);
        if (g !== IGNORE) mapping[h.trim()] = g;
      }
      return { ...s, mapping };
    });
  }

  // A saved connection opens with its sheet loaded.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initial) void preview({ reload: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Any settings change (mapping, match, edited cell, unticked row) re-plans against the loaded table.
  useEffect(() => {
    if (!table) return;
    const id = setTimeout(() => void preview(), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, table]);

  function handlePaste(value: string) {
    setPasteText(value);
    const lines = value.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return setTable(null);
    const [headers, ...rows] = lines.map((l) => l.split("\t"));
    setTable({ headers, rows });
    guessMappingIfEmpty(headers);
  }

  function setTarget(header: string, target: string) {
    const mapping = { ...settings.mapping };
    if (target === IGNORE) delete mapping[header.trim()];
    else mapping[header.trim()] = target;
    patch({ mapping });
  }

  function commitCell() {
    if (!editCell || !table) return;
    const { rowKey, col, value } = editCell;
    setEditCell(null);
    const row = plan.find((r) => r.rowKey === rowKey);
    if (!row) return;
    const header = table.headers[col].trim();
    const raw = table.rows[row.rowNumber - 2]?.[col] ?? "";
    const forRow = { ...(settings.overrides[rowKey] ?? {}) };
    if (value === raw) delete forRow[header];
    else forRow[header] = value;
    const overrides = { ...settings.overrides };
    if (Object.keys(forRow).length) overrides[rowKey] = forRow;
    else delete overrides[rowKey];
    patch({ overrides });
  }

  function toggleRows(rowKeys: string[], include: boolean) {
    const excluded = new Set(settings.excluded);
    for (const k of rowKeys) {
      if (include) excluded.delete(k);
      else excluded.add(k);
    }
    patch({ excluded: [...excluded] });
  }

  async function save(): Promise<PublicSync | null> {
    const res = await fetch(`/api/events/${eventId}/participants/syncs/${initial?.id ?? "new"}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, sheetId: sheetInput, tab, autoSync, everyHours, ...settings }),
    });
    if (!res.ok) {
      setError(t("participantSync.saveFailed"));
      return null;
    }
    return res.json();
  }

  async function handleSave(andSync: boolean) {
    setBusy(true);
    const saved = await save();
    if (saved && andSync) {
      const res = await fetch(`/api/events/${eventId}/participants/syncs/${saved.id}`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.error) setError(driveErrorText(t, data.error.code, { identity: data.error.params?.identity || identityEmail }));
      else if (res.ok && data) setResult(data.counts);
      else setError(t(`participantSync.runError.${data?.error ?? "failed"}`));
    } else if (saved) onClose(true);
    setBusy(false);
  }

  async function handleImportPaste() {
    if (!table) return;
    setBusy(true);
    const res = await fetch(`/api/events/${eventId}/participants/syncs/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings, table, run: true }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (res.ok && data) setResult(data.counts);
    else setError(t("participantSync.runError.failed"));
  }

  const mappedCols = useMemo(
    () => (table?.headers ?? []).flatMap((h, i) => (settings.mapping[h.trim()] ? [i] : [])),
    [table, settings.mapping]
  );
  const shown = plan.filter((r) =>
    filter === "all" ? true : filter === "changes" ? r.status === "create" || r.status === "update" : PROBLEMS.has(r.status)
  );
  const matchOptions = [
    { key: MATCH_BY_NAME, label: t("participantSync.matchByName") },
    { key: REGNUM_TARGET, label: t("participantSync.regNumber") },
    ...fields.filter((f) => f.kind === "custom").map((f) => ({ key: f.key, label: f.label })),
  ];
  const matchColumnMapped =
    settings.matchBy === MATCH_BY_NAME
      ? Object.values(settings.mapping).some((v) => ["Name", "participant_first_name", "participant_last_name"].includes(v))
      : Object.values(settings.mapping).includes(settings.matchBy);
  const willWrite = (counts.create ?? 0) + (counts.update ?? 0);

  if (result) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-[16px] font-semibold text-ink">{t("participantSync.doneTitle")}</h2>
        <p className="text-[14px] text-ink">
          <CountsLine counts={result} />
        </p>
        <div className="flex gap-4">
          <button onClick={() => onClose(true)} className="text-[14px] text-ember hover:underline">
            ← {t("participantSync.backToList")}
          </button>
          <a href={`/events/${eventId}/participants`} className="text-[14px] text-ember hover:underline">
            {t("participantImportPage.goToParticipants")}
          </a>
        </div>
      </div>
    );
  }

  const input = "rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";

  return (
    <div className="flex flex-col gap-4">
      <button onClick={() => onClose(false)} className="self-start text-[13px] text-ink-secondary hover:text-ink">
        ← {t("participantSync.backToList")}
      </button>

      {mode === "sheet" ? (
        <section className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-[12px] text-ink-secondary">
            {t("participantSync.name")}
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("participantSync.namePlaceholder")} className={input} />
          </label>
          <p className="text-[13px] text-ink-secondary">{t("participantImportPage.sheetsInstructions")}</p>
          <p className="break-all rounded-lg bg-paper-2 p-2 font-mono text-[13px] text-ink">{identityEmail || "…"}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={sheetInput} onChange={(e) => setSheetInput(e.target.value)} placeholder={t("participantImportPage.sheetsIdPlaceholder")} className={input + " flex-1"} />
            {tabs.length > 1 && (
              <select
                value={tab}
                onChange={(e) => {
                  setTab(e.target.value);
                  void preview({ reload: true, tab: e.target.value });
                }}
                className={input}
              >
                {tabs.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            )}
            <button
              onClick={() => preview({ reload: true })}
              disabled={loading || !sheetInput.trim()}
              className="rounded-lg bg-ember px-4 py-1.5 text-[13px] font-medium text-white hover:bg-ember-hover disabled:opacity-50"
            >
              {table ? t("participantSync.reload") : t("participantImportPage.sheetsLoadButton")}
            </button>
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-2">
          <p className="text-[13px] text-ink-secondary">{t("participantImportPage.instructions")}</p>
          <textarea
            value={pasteText}
            onChange={(e) => handlePaste(e.target.value)}
            placeholder={t("participantImportPage.pastePlaceholder")}
            className="h-32 w-full rounded-lg border border-mist bg-paper-2 p-3 font-mono text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember"
          />
        </section>
      )}
      {error && <p className="text-[13px] text-red-600">{error}</p>}

      {table && (
        <>
          <section>
            <h2 className="mb-2 text-[15px] font-semibold text-ink">{t("participantImportPage.mappingTitle")}</h2>
            <div className="flex flex-wrap gap-2">
              {table.headers.map((h, i) => (
                <label key={i} className="flex flex-col gap-1 rounded-lg border border-mist bg-paper-2 p-2 text-[12px] text-ink-secondary">
                  <span className="max-w-[180px] truncate" title={h}>
                    {h || `#${i + 1}`}
                  </span>
                  <select value={settings.mapping[h.trim()] ?? IGNORE} onChange={(e) => setTarget(h, e.target.value)} className="rounded-lg border border-mist bg-paper px-2 py-1 text-[13px] text-ink">
                    <option value={IGNORE}>{t("participantImportPage.field.ignore")}</option>
                    <option value={REGNUM_TARGET}>{t("participantSync.regNumberTarget")}</option>
                    {fields.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section className="grid gap-3 rounded-lg border border-mist p-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[12px] text-ink-secondary">
              {t("participantSync.matchBy")}
              <select value={settings.matchBy} onChange={(e) => patch({ matchBy: e.target.value, ...(canCreate(e.target.value) ? {} : { onNew: "report" }) })} className={input}>
                {matchOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span>{matchColumnMapped ? t("participantSync.matchByHint") : <span className="text-amber-700">{t("participantSync.matchColumnMissing")}</span>}</span>
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-ink-secondary">
              {t("participantSync.onNew")}
              <select value={settings.onNew} onChange={(e) => patch({ onNew: e.target.value as SyncSettings["onNew"] })} className={input}>
                <option value="create" disabled={!canCreate(settings.matchBy)}>
                  {t("participantSync.onNew.create")}
                </option>
                <option value="report">{t("participantSync.onNew.report")}</option>
              </select>
              {!canCreate(settings.matchBy) && <span>{t("participantSync.regNumberNoCreate")}</span>}
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-ink-secondary">
              {t("participantSync.onMatch")}
              <select value={settings.onMatch} onChange={(e) => patch({ onMatch: e.target.value as SyncSettings["onMatch"] })} className={input}>
                <option value="fill">{t("participantSync.onMatch.fill")}</option>
                <option value="overwrite">{t("participantSync.onMatch.overwrite")}</option>
                <option value="skip">{t("participantSync.onMatch.skip")}</option>
              </select>
            </label>
            {mode === "sheet" && (
              <div className="flex flex-col gap-1 text-[12px] text-ink-secondary">
                {t("participantSync.auto")}
                <label className="flex items-center gap-2 text-[13px] text-ink">
                  <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} />
                  {t("participantSync.autoOn")}
                  <select value={everyHours} onChange={(e) => setEveryHours(Number(e.target.value))} disabled={!autoSync} className="rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[13px] disabled:opacity-50">
                    {SYNC_INTERVALS.map((h) => (
                      <option key={h} value={h}>
                        {t("participantSync.everyHours", { hours: String(h) })}
                      </option>
                    ))}
                  </select>
                </label>
                <span>{t("participantSync.autoHint")}</span>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-ink">
                {t("participantSync.previewTitle")} {loading && <span className="text-[12px] font-normal text-ink-secondary">{t("common.loading")}</span>}
              </h2>
              <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[13px] text-ink">
                <option value="all">{t("participantSync.filter.all")}</option>
                <option value="changes">{t("participantSync.filter.changes")}</option>
                <option value="problems">{t("participantSync.filter.problems")}</option>
              </select>
            </div>
            <p className="text-[13px] text-ink-secondary">
              <CountsLine counts={counts} />
            </p>
            <p className="text-[12px] text-ink-secondary">{t("participantSync.editHint")}</p>
            <div className="scrollbar-app max-h-[60vh] overflow-auto rounded-lg border border-mist">
              <table className="w-full border-collapse text-[13px]">
                <thead className="sticky top-0 z-10 bg-paper">
                  <tr className="border-b border-mist text-left text-[12px] text-ink-secondary">
                    <th className="p-2">
                      <input
                        type="checkbox"
                        checked={shown.length > 0 && shown.every((r) => r.status !== "excluded")}
                        onChange={(e) => toggleRows(shown.map((r) => r.rowKey), e.target.checked)}
                      />
                    </th>
                    <th className="p-2">#</th>
                    <th className="min-w-[180px] p-2">{t("participantImportPage.colStatus")}</th>
                    {mappedCols.map((c) => (
                      <th key={c} className="p-2 font-medium">
                        <div className="max-w-[200px] truncate" title={table.headers[c]}>
                          {table.headers[c]}
                        </div>
                        <div className="font-normal text-ink-secondary/80">{fieldLabel(settings.mapping[table.headers[c].trim()])}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.rowNumber} className={"border-b border-mist/60 align-top " + (r.status === "excluded" || r.status === "superseded" ? "opacity-50" : "")}>
                      <td className="p-2">
                        <input type="checkbox" checked={r.status !== "excluded"} onChange={(e) => toggleRows([r.rowKey], e.target.checked)} />
                      </td>
                      <td className="p-2 text-ink-secondary">{r.rowNumber}</td>
                      <td className="p-2">
                        <div className={STATUS_CLASS[r.status] ?? "text-ink-secondary"}>
                          {t(`participantSync.status.${r.status}`)}
                          {r.participant && r.status !== "create" && <span className="text-ink-secondary"> · {r.participant.name}</span>}
                        </div>
                        {r.errors.map((e) => (
                          <div key={e} className="text-[12px] text-red-600">
                            {t(`participantSync.error.${e}`)}
                          </div>
                        ))}
                        {r.changes.map((ch, i) => (
                          <div key={i} className="text-[12px] text-ink-secondary" title={`${ch.from} → ${ch.to}`}>
                            {fieldLabel(ch.field)}: {ch.from ? <s>{ch.from.slice(0, 30)}</s> : null} {ch.to.slice(0, 40)}
                          </div>
                        ))}
                      </td>
                      {mappedCols.map((c) => {
                        const editing = editCell?.rowKey === r.rowKey && editCell.col === c;
                        const edited = r.edited.includes(c);
                        return (
                          <td
                            key={c}
                            onClick={() => !editing && setEditCell({ rowKey: r.rowKey, col: c, value: r.cells[c] ?? "" })}
                            title={edited ? t("participantSync.originalValue", { value: table.rows[r.rowNumber - 2]?.[c] ?? "" }) : undefined}
                            className={"max-w-[240px] cursor-text p-2 " + (edited ? "bg-amber-50 text-ink" : "text-ink")}
                          >
                            {editing ? (
                              <input
                                autoFocus
                                value={editCell.value}
                                onChange={(e) => setEditCell({ ...editCell, value: e.target.value })}
                                onBlur={commitCell}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitCell();
                                  if (e.key === "Escape") setEditCell(null);
                                }}
                                className="w-full min-w-[120px] rounded border border-ember bg-paper px-1 py-0.5 text-[13px]"
                              />
                            ) : (
                              <span className="line-clamp-3 break-words">{r.cells[c] || <span className="text-ink-secondary">—</span>}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            {mode === "sheet" ? (
              <>
                <button onClick={() => handleSave(false)} disabled={busy || !sheetInput.trim()} className="rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2 disabled:opacity-50">
                  {t("participantSync.save")}
                </button>
                <button onClick={() => handleSave(true)} disabled={busy || loading || !sheetInput.trim()} className="rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50">
                  {busy ? t("common.loading") : t("participantSync.saveAndSync", { count: String(willWrite) })}
                </button>
              </>
            ) : (
              <button onClick={handleImportPaste} disabled={busy || loading || willWrite === 0} className="rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50">
                {busy ? t("common.loading") : t("participantSync.importNow", { count: String(willWrite) })}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
