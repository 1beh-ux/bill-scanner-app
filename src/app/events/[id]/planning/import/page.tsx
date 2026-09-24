"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { driveErrorText } from "@/lib/drive-error-messages";
import { PLAN_IMPORT_TARGETS, type PlanImportConnection, type PlanImportTarget } from "@/lib/planning";
import { IMPORT_FIELDS, guessMapping, parseTable } from "@/lib/planning-import";
import type { ImportResult } from "@/lib/planning-import-run";

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const btnSecondary =
  "rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[13px] text-ink hover:bg-mist disabled:opacity-50";
const tabClass = (on: boolean) =>
  "border-b-2 px-3 py-2 text-[13px] font-medium " + (on ? "border-ember text-ink" : "border-transparent text-ink-secondary hover:text-ink");

// Planning import (design doc "Import"): pick what to import, paste a table or
// load a Google Sheet tab, map columns to fields, preview (server dry run),
// import. Mirrors the participant import's flow; a sheet connection (id, tab,
// mapping by header) is saved per import target.
export default function PlanningImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const { t } = useTranslations();

  const [target, setTarget] = useState<PlanImportTarget>("schedule");
  const [source, setSource] = useState<"paste" | "sheets">("paste");
  const [pasteText, setPasteText] = useState("");
  const [sheetInput, setSheetInput] = useState("");
  const [sheet, setSheet] = useState<{ spreadsheetId: string; tabs: string[]; tab: string } | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [connections, setConnections] = useState<Partial<Record<PlanImportTarget, PlanImportConnection>>>({});

  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<string[]>([]);
  const [mode, setMode] = useState<"replace" | "append">("replace");
  const [createMissing, setCreateMissing] = useState(true);

  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fields = IMPORT_FIELDS[target];

  useEffect(() => {
    fetch(`/api/events/${eventId}/planning/import/settings`)
      .then((r) => (r.ok ? r.json() : {}))
      .then(setConnections);
  }, [eventId]);

  function reset() {
    setPreview(null);
    setDone(null);
    setError(null);
    setMessage(null);
  }

  // New data or a new target: re-guess the mapping, but a saved connection's
  // header -> field choices win for the headers it knows.
  function load(nextHeaders: string[], nextRows: string[][], forTarget = target, saved?: Record<string, string>) {
    const guessed = guessMapping(nextHeaders, forTarget);
    setHeaders(nextHeaders);
    setRows(nextRows);
    setMapping(nextHeaders.map((h, i) => saved?.[h.trim()] ?? guessed[i]));
    reset();
  }

  function onPaste(text: string) {
    setPasteText(text);
    const table = parseTable(text);
    load(table[0] ?? [], table.slice(1));
  }

  async function loadSheet(input: string, tab?: string, forTarget = target) {
    if (!input.trim()) return;
    setSheetBusy(true);
    reset();
    const res = await fetch(`/api/events/${eventId}/planning/import/sheet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spreadsheetId: input.trim(), tab }),
    });
    const body = await res.json().catch(() => ({}));
    setSheetBusy(false);
    if (!res.ok) {
      setError(driveErrorText(t, body.error ?? "drive_unknown", body));
      return;
    }
    setSheet({ spreadsheetId: body.spreadsheetId, tabs: body.tabs, tab: body.tab });
    const saved = connections[forTarget];
    load(body.headers, body.rows, forTarget, saved?.sheetId === body.spreadsheetId ? saved?.mapping : undefined);
  }

  function chooseTarget(next: PlanImportTarget) {
    setTarget(next);
    const saved = connections[next];
    if (saved) {
      setSource("sheets");
      setSheetInput(saved.sheetId);
      loadSheet(saved.sheetId, saved.tab, next);
    } else if (source === "paste") {
      const table = parseTable(pasteText);
      load(table[0] ?? [], table.slice(1), next);
    } else {
      load(headers, rows, next);
    }
  }

  async function saveConnection() {
    if (!sheet) return;
    const connection: PlanImportConnection = {
      sheetId: sheet.spreadsheetId,
      tab: sheet.tab,
      mapping: Object.fromEntries(headers.map((h, i) => [h.trim(), mapping[i]]).filter(([, k]) => k)),
    };
    const res = await fetch(`/api/events/${eventId}/planning/import/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, connection }),
    });
    if (res.ok) {
      setConnections(await res.json());
      setMessage(t("planImport.connectionSaved"));
    } else setError(t("planBoard.errorSaveFailed"));
  }

  const records = useMemo(
    () =>
      rows.map((row) => {
        const rec: Record<string, string> = {};
        mapping.forEach((key, i) => {
          if (key && row[i]?.trim()) rec[key] = row[i];
        });
        return rec;
      }),
    [rows, mapping]
  );
  const missingRequired = fields.filter((f) => f.required && !mapping.includes(f.key));
  const scheduleHasTime = target !== "schedule" || mapping.includes("time") || mapping.includes("start");

  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/events/${eventId}/planning/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, records, options: { mode, createMissing }, dryRun }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(t("planImport.errorFailed"));
      return;
    }
    const result = (await res.json()) as ImportResult;
    if (dryRun) setPreview(result);
    else {
      setPreview(null);
      setDone(result);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <a href={`/events/${eventId}/planning`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("nav.planning")}
      </a>
      <h1 className="mb-1 mt-2 text-[22px] font-semibold text-ink">{t("planImport.title")}</h1>
      <p className="mb-4 text-[13px] text-ink-secondary">{t(`planImport.hint.${target}`)}</p>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {PLAN_IMPORT_TARGETS.map((key) => (
          <button
            key={key}
            onClick={() => chooseTarget(key)}
            className={
              "rounded-lg px-3 py-1.5 text-[13px] " + (target === key ? "bg-ember font-medium text-white" : "bg-paper-2 text-ink hover:bg-mist")
            }
          >
            {t(`planImport.target.${key}`)}
            {connections[key] && " ⛁"}
          </button>
        ))}
      </div>

      <div className="mb-3 flex gap-1 border-b border-mist">
        <button onClick={() => setSource("paste")} className={tabClass(source === "paste")}>
          {t("planImport.sourcePaste")}
        </button>
        <button onClick={() => setSource("sheets")} className={tabClass(source === "sheets")}>
          {t("planImport.sourceSheets")}
        </button>
      </div>

      {source === "paste" ? (
        <textarea
          value={pasteText}
          onChange={(e) => onPaste(e.target.value)}
          placeholder={t("planImport.pastePlaceholder")}
          rows={6}
          className={inputClass + " font-mono text-[12.5px]"}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={sheetInput}
              onChange={(e) => setSheetInput(e.target.value)}
              placeholder={t("planImport.sheetPlaceholder")}
              className={inputClass}
            />
            <button onClick={() => loadSheet(sheetInput)} disabled={sheetBusy || !sheetInput.trim()} className={btnSecondary}>
              {sheetBusy ? t("common.loading") : t("planImport.loadSheet")}
            </button>
          </div>
          {sheet && (
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <label className="flex items-center gap-2 text-ink-secondary">
                {t("planImport.sheetTab")}
                <select
                  value={sheet.tab}
                  onChange={(e) => loadSheet(sheet.spreadsheetId, e.target.value)}
                  className={inputClass + " w-auto py-1.5"}
                >
                  {sheet.tabs.map((tab) => (
                    <option key={tab} value={tab}>
                      {tab}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={saveConnection} className="text-ember hover:underline">
                {t("planImport.saveConnection")}
              </button>
              {connections[target] && (
                <span className="text-[12px] text-ink-secondary">{t("planImport.connectionActive")}</span>
              )}
            </div>
          )}
          <p className="text-[12px] text-ink-secondary">{t("planImport.sheetShareHint")}</p>
        </div>
      )}

      {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}
      {message && <p className="mt-3 text-[13px] text-ink-secondary">{message}</p>}

      {headers.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 text-[16px] font-semibold text-ink">
            {t("planImport.mappingTitle")} <span className="text-[13px] font-normal text-ink-secondary">({t("planImport.rowCount", { count: String(rows.length) })})</span>
          </h2>
          <div className="overflow-x-auto rounded-lg border border-mist">
            <table className="w-full text-[13px]">
              <tbody>
                {headers.map((h, i) => (
                  <tr key={i} className="border-b border-mist/60 last:border-0">
                    <td className="p-2 font-medium text-ink">{h || `#${i + 1}`}</td>
                    <td className="max-w-[260px] truncate p-2 text-ink-secondary">
                      {rows.map((r) => r[i]).filter(Boolean).slice(0, 2).join(" · ")}
                    </td>
                    <td className="w-[220px] p-2">
                      <select
                        value={mapping[i] ?? ""}
                        onChange={(e) => {
                          setMapping(mapping.map((m, j) => (j === i ? e.target.value : m)));
                          reset();
                        }}
                        className={inputClass + " py-1.5"}
                      >
                        <option value="">{t("planImport.ignoreColumn")}</option>
                        {fields.map((f) => (
                          <option key={f.key} value={f.key}>
                            {t(`planImport.field.${f.key}`)}
                            {f.required ? " *" : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-[13px]">
            {target === "schedule" && (
              <fieldset className="flex flex-wrap items-center gap-3">
                <legend className="sr-only">{t("planImport.modeLabel")}</legend>
                <span className="text-ink-secondary">{t("planImport.modeLabel")}</span>
                {(["replace", "append"] as const).map((m) => (
                  <label key={m} className="flex items-center gap-1.5 text-ink">
                    <input type="radio" checked={mode === m} onChange={() => (setMode(m), reset())} />
                    {t(`planImport.mode.${m}`)}
                  </label>
                ))}
              </fieldset>
            )}
            {(target === "schedule" || target === "activities") && (
              <label className="flex items-center gap-1.5 text-ink">
                <input type="checkbox" checked={createMissing} onChange={(e) => (setCreateMissing(e.target.checked), reset())} />
                {t("planImport.createMissing")}
              </label>
            )}
          </div>

          {(missingRequired.length > 0 || !scheduleHasTime) && (
            <p className="mt-3 text-[13px] text-red-600">
              {t("planImport.missingRequired", {
                fields: [...missingRequired.map((f) => t(`planImport.field.${f.key}`)), ...(scheduleHasTime ? [] : [t("planImport.field.start")])].join(", "),
              })}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button onClick={() => run(true)} disabled={busy || missingRequired.length > 0 || !scheduleHasTime || rows.length === 0} className={btnSecondary}>
              {busy && !preview ? t("common.loading") : t("planImport.check")}
            </button>
            <button onClick={() => run(false)} disabled={busy || !preview} className={btnPrimary} title={preview ? undefined : t("planImport.checkFirst")}>
              {t("planImport.run")}
            </button>
          </div>
        </>
      )}

      {(preview || done) && <ResultView result={(preview ?? done)!} applied={Boolean(done)} eventId={eventId} />}
    </div>
  );
}

function ResultView({ result, applied, eventId }: { result: ImportResult; applied: boolean; eventId: string }) {
  const { t } = useTranslations();
  const counts = Object.entries(result.counts).filter(([, n]) => n > 0);
  // Record index -> sheet/table row number (row 1 is the header).
  const rowNo = (i: number) => String(i + 2);
  return (
    <section className="mt-6 rounded-lg border border-mist bg-paper-2 p-4 text-[13px]">
      <h2 className="mb-2 text-[15px] font-semibold text-ink">{t(applied ? "planImport.doneTitle" : "planImport.previewTitle")}</h2>
      {counts.length === 0 ? (
        <p className="text-ink-secondary">{t("planImport.nothing")}</p>
      ) : (
        <ul className="mb-3 list-none p-0">
          {counts.map(([key, n]) => (
            <li key={key}>
              {t(`planImport.count.${key}`)}: <strong>{n}</strong>
            </li>
          ))}
        </ul>
      )}
      {applied && (
        <a href={`/events/${eventId}/planning`} className="text-ember hover:underline">
          {t("planImport.openBoard")}
        </a>
      )}
      {[
        { list: result.errors, title: t("planImport.errorsTitle"), cls: "text-red-600" },
        { list: result.warnings, title: t("planImport.warningsTitle"), cls: "text-amber-700" },
      ].map(
        ({ list, title, cls }) =>
          list.length > 0 && (
            <details key={title} open={list === result.errors} className="mt-3">
              <summary className={"cursor-pointer font-medium " + cls}>
                {title} ({list.length})
              </summary>
              <ul className="mt-1 list-none p-0">
                {list.slice(0, 200).map((issue, i) => (
                  <li key={i}>
                    {t("planImport.rowLabel", { row: rowNo(issue.row) })}: {t(`planImport.issue.${issue.code}`)}
                    {issue.value && <span className="text-ink-secondary"> („{issue.value}“)</span>}
                  </li>
                ))}
              </ul>
            </details>
          )
      )}
    </section>
  );
}
