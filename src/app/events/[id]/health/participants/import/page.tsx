"use client";

import { useMemo, useState, use } from "react";
import { useTranslations } from "@/lib/i18n";

type FieldTarget =
  | "name"
  | "groupName"
  | "allergies"
  | "medsNotes"
  | "chronicIssues"
  | "otherNotes"
  | "guardianEmail"
  | "ignore";

const FIELD_TARGETS: FieldTarget[] = [
  "ignore",
  "name",
  "groupName",
  "allergies",
  "medsNotes",
  "chronicIssues",
  "otherNotes",
  "guardianEmail",
];

const EMAIL_RE = /\S+@\S+\.\S+/;

function guessTarget(header: string): FieldTarget {
  const h = header.trim().toLowerCase();
  if (!h) return "ignore";
  if (h.includes("jméno") || h.includes("jmeno") || h.includes("name")) return "name";
  if (h.includes("skupina") || h.includes("oddíl") || h.includes("oddil") || h.includes("group")) return "groupName";
  if (h.includes("alergi")) return "allergies";
  if (h.includes("lék") || h.includes("lek") || h.includes("medikace") || h.includes("meds")) return "medsNotes";
  if (h.includes("chronic")) return "chronicIssues";
  if (h.includes("poznámk") || h.includes("poznamk") || h.includes("other") || h.includes("ostatní") || h.includes("ostatni"))
    return "otherNotes";
  if (h.includes("e-mail") || h.includes("email") || h.includes("kontakt")) return "guardianEmail";
  return "ignore";
}

type ParsedRow = {
  cells: string[];
  name: string;
  groupName: string;
  allergies: string;
  medsNotes: string;
  chronicIssues: string;
  otherNotes: string;
  guardianEmail: string;
  errors: string[];
};

function resolveField(cells: string[], mapping: FieldTarget[], target: FieldTarget): string {
  const idx = mapping.indexOf(target);
  if (idx === -1) return "";
  return (cells[idx] ?? "").trim();
}

function buildRows(dataLines: string[], mapping: FieldTarget[]): ParsedRow[] {
  return dataLines
    .map((line) => line.split("\t"))
    .filter((cells) => cells.some((c) => c.trim()))
    .map((cells) => {
      const name = resolveField(cells, mapping, "name");
      const guardianEmail = resolveField(cells, mapping, "guardianEmail");
      const errors: string[] = [];
      if (!name) errors.push("missing_name");
      if (guardianEmail && !EMAIL_RE.test(guardianEmail)) errors.push("invalid_email");
      return {
        cells,
        name,
        groupName: resolveField(cells, mapping, "groupName"),
        allergies: resolveField(cells, mapping, "allergies"),
        medsNotes: resolveField(cells, mapping, "medsNotes"),
        chronicIssues: resolveField(cells, mapping, "chronicIssues"),
        otherNotes: resolveField(cells, mapping, "otherNotes"),
        guardianEmail,
        errors,
      };
    });
}

export default function ParticipantImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = use(params);
  const { t } = useTranslations();

  const [pasteText, setPasteText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<FieldTarget[]>([]);
  const [dataLines, setDataLines] = useState<string[]>([]);

  const [importing, setImporting] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [done, setDone] = useState(false);

  function handlePasteChange(value: string) {
    setPasteText(value);
    const lines = value.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length === 0) {
      setHeaders([]);
      setMapping([]);
      setDataLines([]);
      return;
    }
    const headerCells = lines[0].split("\t");
    setHeaders(headerCells);
    setMapping(headerCells.map(guessTarget));
    setDataLines(lines.slice(1));
  }

  function updateMapping(index: number, target: FieldTarget) {
    setMapping((prev) => prev.map((v, i) => (i === index ? target : v)));
  }

  const rows = useMemo(() => buildRows(dataLines, mapping), [dataLines, mapping]);
  const validRows = useMemo(() => rows.filter((r) => r.errors.length === 0), [rows]);
  const invalidCount = rows.length - validRows.length;

  async function handleImport() {
    setImporting(true);
    let succeeded = 0;
    let failed = 0;

    await Promise.all(
      validRows.map(async (row) => {
        try {
          const res = await fetch(`/api/events/${eventId}/participants`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: row.name,
              groupName: row.groupName || undefined,
              allergies: row.allergies || undefined,
              medsNotes: row.medsNotes || undefined,
              chronicIssues: row.chronicIssues || undefined,
              otherNotes: row.otherNotes || undefined,
              guardians: row.guardianEmail ? [{ email: row.guardianEmail }] : [],
            }),
          });
          if (res.ok) succeeded++;
          else failed++;
        } catch {
          failed++;
        }
      })
    );

    setImporting(false);
    setCreatedCount(succeeded);
    setFailedCount(failed);
    setDone(true);
  }

  if (done) {
    return (
      <div className="mx-auto max-w-2xl p-4 md:p-8">
        <p className="mb-4 text-[14px] text-pine">
          {t("participantImportPage.doneMessage", { count: String(createdCount) })}
        </p>
        {failedCount > 0 && (
          <p className="mb-4 text-[14px] text-amber-700">
            {t("participantImportPage.doneFailures", { count: String(failedCount) })}
          </p>
        )}
        <a href={`/events/${eventId}/health`} className="text-[14px] text-ember hover:underline">
          {t("participantImportPage.goToParticipants")}
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <a href={`/events/${eventId}/health`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("participantsPage.title")}
      </a>

      <h1 className="mb-2 mt-2 text-[22px] font-semibold text-ink">{t("participantImportPage.title")}</h1>
      <p className="mb-4 text-[14px] text-ink-secondary">{t("participantImportPage.instructions")}</p>

      <textarea
        value={pasteText}
        onChange={(e) => handlePasteChange(e.target.value)}
        placeholder={t("participantImportPage.pastePlaceholder")}
        className="mb-4 h-40 w-full rounded-lg border border-mist bg-paper-2 p-3 font-mono text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember"
      />

      {headers.length > 0 && (
        <>
          <h2 className="mb-2 text-[16px] font-semibold text-ink">{t("participantImportPage.mappingTitle")}</h2>
          <div className="mb-4 flex flex-wrap gap-3">
            {headers.map((h, i) => (
              <div key={i} className="rounded-lg border border-mist bg-paper-2 p-2">
                <div className="mb-1 text-[12px] text-ink-secondary">{h || `#${i + 1}`}</div>
                <select
                  value={mapping[i]}
                  onChange={(e) => updateMapping(i, e.target.value as FieldTarget)}
                  className="rounded-lg border border-mist bg-paper px-2 py-1 text-[13px] text-ink"
                >
                  {FIELD_TARGETS.map((target) => (
                    <option key={target} value={target}>
                      {t(`participantImportPage.field.${target}`)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <p className="mb-2 text-[13px] text-ink-secondary">
            {t("participantImportPage.previewSummary", {
              valid: String(validRows.length),
              invalid: String(invalidCount),
            })}
          </p>

          <div className="mb-4 overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse">
              <thead>
                <tr className="border-b border-mist text-left">
                  <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("common.name")}</th>
                  <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantsPage.colGroup")}</th>
                  <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantDetail.guardianEmailLabel")}</th>
                  <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantImportPage.colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className={"border-b border-mist/60 " + (row.errors.length > 0 ? "bg-red-50" : "")}>
                    <td className="p-2 text-[14px] text-ink">{row.name || "—"}</td>
                    <td className="p-2 text-[14px] text-ink-secondary">{row.groupName || "—"}</td>
                    <td className="p-2 text-[14px] text-ink-secondary">{row.guardianEmail || "—"}</td>
                    <td className="p-2 text-[13px]">
                      {row.errors.length === 0 ? (
                        <span className="text-pine">{t("participantImportPage.statusOk")}</span>
                      ) : (
                        <span className="text-red-600">
                          {row.errors.map((e) => t(`participantImportPage.error.${e}`)).join(", ")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleImport}
            disabled={importing || validRows.length === 0}
            className="rounded-lg bg-ember px-5 py-2.5 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50"
          >
            {importing ? t("common.loading") : t("participantImportPage.importButton")}
          </button>
        </>
      )}
    </div>
  );
}
