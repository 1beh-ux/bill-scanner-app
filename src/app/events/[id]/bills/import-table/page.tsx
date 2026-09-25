"use client";

import { use, useMemo, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { driveErrorText } from "@/lib/drive-error-messages";
import { BILL_IMPORT_FIELDS } from "@/lib/bills-import";
import { guessMappingFor, parseTable } from "@/lib/planning-import";
import type { BillImportResult } from "@/lib/bills-import-run";

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const btnSecondary =
  "rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[13px] text-ink hover:bg-mist disabled:opacity-50";
const tabClass = (on: boolean) =>
  "border-b-2 px-3 py-2 text-[13px] font-medium " + (on ? "border-ember text-ink" : "border-transparent text-ink-secondary hover:text-ink");
const CHUNK = 10;

// Bills from a table (e.g. the old Apps Script export): paste or load a Google
// Sheet tab, map columns, check (dry run, no downloads), import in chunks --
// each row's Drive file is downloaded and becomes one bill with the row's data.
export default function BillTableImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const { t } = useTranslations();

  const [source, setSource] = useState<"paste" | "sheets">("sheets");
  const [pasteText, setPasteText] = useState("");
  const [sheetInput, setSheetInput] = useState("");
  const [sheet, setSheet] = useState<{ spreadsheetId: string; tabs: string[]; tab: string } | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<string[]>([]);
  const [approveComplete, setApproveComplete] = useState(false);
  const [createMissing, setCreateMissing] = useState(true);

  const [preview, setPreview] = useState<BillImportResult | null>(null);
  const [done, setDone] = useState<BillImportResult | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load(nextHeaders: string[], nextRows: string[][]) {
    setHeaders(nextHeaders);
    setRows(nextRows);
    setMapping(guessMappingFor(nextHeaders, BILL_IMPORT_FIELDS));
    setPreview(null);
    setDone(null);
    setError(null);
  }

  async function loadSheet(input: string, tab?: string) {
    if (!input.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/events/${eventId}/bills/import-table/sheet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spreadsheetId: input.trim(), tab }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(driveErrorText(t, body.error ?? "drive_unknown", body));
    setSheet({ spreadsheetId: body.spreadsheetId, tabs: body.tabs, tab: body.tab });
    load(body.headers, body.rows);
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
  const missingRequired = BILL_IMPORT_FIELDS.filter((f) => f.required && !mapping.includes(f.key));
  const options = { approveComplete, createMissing };

  async function post(body: object): Promise<BillImportResult | null> {
    const res = await fetch(`/api/events/${eventId}/bills/import-table`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    return res?.ok ? res.json() : null;
  }

  async function check() {
    setBusy(true);
    setError(null);
    const result = await post({ records, options, dryRun: true });
    setBusy(false);
    if (!result) return setError(t("billImport.errorFailed"));
    setPreview(result);
    setDone(null);
  }

  // Real run in chunks; results merged so the report covers the whole table.
  async function run() {
    setBusy(true);
    setError(null);
    const total: BillImportResult = { counts: {}, errors: [], warnings: [] };
    for (let start = 0; start < records.length; start += CHUNK) {
      setProgress({ done: start, total: records.length });
      const result = await post({ records: records.slice(start, start + CHUNK), options, dryRun: false, rowOffset: start });
      if (!result) {
        total.errors.push({ row: start, code: "chunk_failed" });
        continue;
      }
      for (const [k, n] of Object.entries(result.counts)) total.counts[k] = (total.counts[k] ?? 0) + n;
      total.errors.push(...result.errors);
      total.warnings.push(...result.warnings);
    }
    setProgress(null);
    setBusy(false);
    setPreview(null);
    setDone(total);
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <a href={`/events/${eventId}/bills`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("nav.bills")}
      </a>
      <h1 className="mb-1 mt-2 text-[22px] font-semibold text-ink">{t("billImport.title")}</h1>
      <p className="mb-4 text-[13px] text-ink-secondary">{t("billImport.hint")}</p>

      <div className="mb-3 flex gap-1 border-b border-mist">
        <button onClick={() => setSource("sheets")} className={tabClass(source === "sheets")}>
          {t("planImport.sourceSheets")}
        </button>
        <button onClick={() => setSource("paste")} className={tabClass(source === "paste")}>
          {t("planImport.sourcePaste")}
        </button>
      </div>

      {source === "paste" ? (
        <textarea
          value={pasteText}
          onChange={(e) => {
            setPasteText(e.target.value);
            const table = parseTable(e.target.value);
            load(table[0] ?? [], table.slice(1));
          }}
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
            <button onClick={() => loadSheet(sheetInput)} disabled={busy || !sheetInput.trim()} className={btnSecondary}>
              {busy && !sheet ? t("common.loading") : t("planImport.loadSheet")}
            </button>
          </div>
          {sheet && (
            <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
              {t("planImport.sheetTab")}
              <select value={sheet.tab} onChange={(e) => loadSheet(sheet.spreadsheetId, e.target.value)} className={inputClass + " w-auto py-1.5"}>
                {sheet.tabs.map((tab) => (
                  <option key={tab} value={tab}>
                    {tab}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="text-[12px] text-ink-secondary">{t("billImport.shareHint")}</p>
        </div>
      )}

      {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}

      {headers.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 text-[16px] font-semibold text-ink">
            {t("planImport.mappingTitle")}{" "}
            <span className="text-[13px] font-normal text-ink-secondary">({t("planImport.rowCount", { count: String(rows.length) })})</span>
          </h2>
          <div className="overflow-x-auto rounded-lg border border-mist">
            <table className="w-full text-[13px]">
              <tbody>
                {headers.map((h, i) => (
                  <tr key={i} className="border-b border-mist/60 last:border-0">
                    <td className="p-2 font-medium text-ink">{h || `#${i + 1}`}</td>
                    <td className="max-w-[260px] truncate p-2 text-ink-secondary">{rows.map((r) => r[i]).filter(Boolean).slice(0, 2).join(" · ")}</td>
                    <td className="w-[220px] p-2">
                      <select
                        value={mapping[i] ?? ""}
                        onChange={(e) => {
                          setMapping(mapping.map((m, j) => (j === i ? e.target.value : m)));
                          setPreview(null);
                        }}
                        className={inputClass + " py-1.5"}
                      >
                        <option value="">{t("planImport.ignoreColumn")}</option>
                        {BILL_IMPORT_FIELDS.map((f) => (
                          <option key={f.key} value={f.key}>
                            {t(`billImport.field.${f.key}`)}
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

          <div className="mt-4 flex flex-wrap items-center gap-4 text-[13px] text-ink">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={createMissing} onChange={(e) => (setCreateMissing(e.target.checked), setPreview(null))} />
              {t("billImport.createMissing")}
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={approveComplete} onChange={(e) => setApproveComplete(e.target.checked)} />
              {t("billImport.approveComplete")}
            </label>
          </div>

          {missingRequired.length > 0 && (
            <p className="mt-3 text-[13px] text-red-600">
              {t("planImport.missingRequired", { fields: missingRequired.map((f) => t(`billImport.field.${f.key}`)).join(", ") })}
            </p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button onClick={check} disabled={busy || missingRequired.length > 0 || rows.length === 0} className={btnSecondary}>
              {busy && !progress ? t("common.loading") : t("planImport.check")}
            </button>
            <button onClick={run} disabled={busy || !preview} className={btnPrimary} title={preview ? undefined : t("planImport.checkFirst")}>
              {t("planImport.run")}
            </button>
            {progress && (
              <span className="flex items-center gap-2 text-[13px] text-ink-secondary">
                <progress value={progress.done} max={progress.total} className="w-40" />
                {t("billImport.progress", { done: String(progress.done), total: String(progress.total) })}
              </span>
            )}
          </div>
        </>
      )}

      {(preview || done) && <ResultView result={(preview ?? done)!} applied={Boolean(done)} eventId={eventId} />}
    </div>
  );
}

function ResultView({ result, applied, eventId }: { result: BillImportResult; applied: boolean; eventId: string }) {
  const { t } = useTranslations();
  const counts = Object.entries(result.counts).filter(([, n]) => n > 0);
  const rowNo = (i: number) => String(i + 2); // row 1 = header
  return (
    <section className="mt-6 rounded-lg border border-mist bg-paper-2 p-4 text-[13px]">
      <h2 className="mb-2 text-[15px] font-semibold text-ink">{t(applied ? "planImport.doneTitle" : "planImport.previewTitle")}</h2>
      {counts.length === 0 ? (
        <p className="text-ink-secondary">{t("planImport.nothing")}</p>
      ) : (
        <ul className="mb-3 list-none p-0">
          {counts.map(([key, n]) => (
            <li key={key}>
              {t(`billImport.count.${key}`)}: <strong>{n}</strong>
            </li>
          ))}
        </ul>
      )}
      {applied && (
        <a href={`/events/${eventId}/bills`} className="text-ember hover:underline">
          {t("billImport.openBills")}
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
                {list.slice(0, 300).map((issue, i) => (
                  <li key={i}>
                    {t("planImport.rowLabel", { row: rowNo(issue.row) })}: {t(`billImport.issue.${issue.code}`)}
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
