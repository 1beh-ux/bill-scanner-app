"use client";

import { useEffect, useMemo, useState, use } from "react";
import { useTranslations } from "@/lib/i18n";

type FieldTarget =
  | "name"
  | "groupName"
  | "dateOfBirth"
  | "allergies"
  | "medsNotes"
  | "chronicIssues"
  | "otherNotes"
  | "guardianName"
  | "guardianEmail"
  | "ignore";

const FIELD_TARGETS: FieldTarget[] = [
  "ignore",
  "name",
  "groupName",
  "dateOfBirth",
  "allergies",
  "medsNotes",
  "chronicIssues",
  "otherNotes",
  "guardianName",
  "guardianEmail",
];

// Fields where mapping more than one column labels each value with its own
// column header before joining ("Poznámka 1: ... | Poznámka 2: ...") so
// context isn't lost. Name-like fields stay plain concatenation.
const LABELED_MERGE_TARGETS: FieldTarget[] = ["allergies", "medsNotes", "chronicIssues", "otherNotes"];

const EMAIL_RE = /\S+@\S+\.\S+/;
const DATE_SEP_RE = /^(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{4})$/;

function guessTarget(header: string): FieldTarget {
  const h = header.trim().toLowerCase();
  if (!h) return "ignore";
  if (h.includes("narozen") || h.includes("datum nar") || h.includes("dob") || h.includes("birth")) return "dateOfBirth";
  if (h.includes("rodič") || h.includes("rodic") || h.includes("zástupce") || h.includes("zastupce") || h.includes("guardian"))
    return "guardianName";
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

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Every column mapped to a target is combined, not just the first -- lets
// e.g. separate "Jméno" and "Příjmení" columns both map to "name". For
// notes-type targets, more than one source column gets labeled with its own
// header so the merged text still says which column said what.
function resolveField(
  cells: string[],
  headers: string[],
  mapping: FieldTarget[],
  target: FieldTarget
): string {
  const matches: { header: string; value: string }[] = [];
  mapping.forEach((m, i) => {
    if (m !== target) return;
    const v = (cells[i] ?? "").trim();
    if (v) matches.push({ header: headers[i]?.trim() || `#${i + 1}`, value: v });
  });
  if (matches.length === 0) return "";
  if (matches.length === 1 || !LABELED_MERGE_TARGETS.includes(target)) {
    return matches.map((m) => m.value).join(" ");
  }
  return matches.map((m) => `${m.header}: ${m.value}`).join(" | ");
}

// DD/MM vs MM/DD can't be resolved per-row (both parts <=12 is genuinely
// ambiguous) -- instead scan the whole pasted batch once for a row that
// disambiguates it (a value > 12 can only be a day), and apply that one
// order to every row. Defaults to day-first (Czech convention) if the
// entire batch is ambiguous.
function detectDateOrder(rawValues: string[]): "dayFirst" | "monthFirst" {
  for (const raw of rawValues) {
    const m = raw.trim().match(DATE_SEP_RE);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12) return "dayFirst";
    if (b > 12) return "monthFirst";
  }
  return "dayFirst";
}

function formatDob(raw: string, order: "dayFirst" | "monthFirst"): string | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  const m = v.match(DATE_SEP_RE);
  if (m) {
    const [, first, second, year] = m;
    const day = order === "dayFirst" ? first : second;
    const month = order === "dayFirst" ? second : first;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const parsed = new Date(v);
  return isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

type ExistingParticipant = {
  id: string;
  name: string;
  groupName: string | null;
};

type ParsedRow = {
  index: number;
  cells: string[];
  name: string;
  groupName: string;
  dateOfBirthRaw: string;
  dateOfBirthIso: string | undefined;
  allergies: string;
  medsNotes: string;
  chronicIssues: string;
  otherNotes: string;
  guardianName: string;
  guardianEmail: string;
  errors: string[];
  duplicateOf: ExistingParticipant | null;
};

type RowAction = "create" | "skip" | "merge";

function buildRows(
  dataLines: string[],
  headers: string[],
  mapping: FieldTarget[],
  existingParticipants: ExistingParticipant[]
): ParsedRow[] {
  const cellRows = dataLines.map((line) => line.split("\t")).filter((cells) => cells.some((c) => c.trim()));
  const rawDobs = cellRows.map((cells) => resolveField(cells, headers, mapping, "dateOfBirth"));
  const dateOrder = detectDateOrder(rawDobs);
  const existingByName = new Map(existingParticipants.map((p) => [normalizeName(p.name), p]));

  return cellRows.map((cells, index) => {
    const name = resolveField(cells, headers, mapping, "name");
    const guardianEmail = resolveField(cells, headers, mapping, "guardianEmail");
    const dateOfBirthRaw = resolveField(cells, headers, mapping, "dateOfBirth");
    const errors: string[] = [];
    if (!name) errors.push("missing_name");
    if (guardianEmail && !EMAIL_RE.test(guardianEmail)) errors.push("invalid_email");
    return {
      index,
      cells,
      name,
      groupName: resolveField(cells, headers, mapping, "groupName"),
      dateOfBirthRaw,
      dateOfBirthIso: formatDob(dateOfBirthRaw, dateOrder),
      allergies: resolveField(cells, headers, mapping, "allergies"),
      medsNotes: resolveField(cells, headers, mapping, "medsNotes"),
      chronicIssues: resolveField(cells, headers, mapping, "chronicIssues"),
      otherNotes: resolveField(cells, headers, mapping, "otherNotes"),
      guardianName: resolveField(cells, headers, mapping, "guardianName"),
      guardianEmail,
      errors,
      duplicateOf: name ? (existingByName.get(normalizeName(name)) ?? null) : null,
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
  const [existingParticipants, setExistingParticipants] = useState<ExistingParticipant[]>([]);
  const [rowOverrides, setRowOverrides] = useState<Record<number, RowAction>>({});

  const [importing, setImporting] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const [mergedCount, setMergedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/events/${eventId}/participants`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setExistingParticipants)
      .catch(() => {});
  }, [eventId]);

  function handlePasteChange(value: string) {
    setPasteText(value);
    setRowOverrides({});
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
    setRowOverrides({});
    setMapping((prev) => prev.map((v, i) => (i === index ? target : v)));
  }

  const rows = useMemo(
    () => buildRows(dataLines, headers, mapping, existingParticipants),
    [dataLines, headers, mapping, existingParticipants]
  );

  function actionFor(row: ParsedRow): RowAction {
    return rowOverrides[row.index] ?? (row.duplicateOf ? "skip" : "create");
  }

  const importableRows = useMemo(() => rows.filter((r) => r.errors.length === 0), [rows]);
  const invalidCount = rows.length - importableRows.length;
  const duplicateRows = useMemo(() => rows.filter((r) => r.duplicateOf), [rows]);
  const duplicateCount = duplicateRows.length;

  // Sets the same action for every duplicate row at once -- most imports
  // want the same choice across the board, but individual rows can still
  // be changed afterward via their own select.
  function applyActionToAllDuplicates(action: RowAction) {
    setRowOverrides((prev) => {
      const next = { ...prev };
      for (const row of duplicateRows) next[row.index] = action;
      return next;
    });
  }

  // Merges an import row into an existing participant: structured fields
  // (group, date of birth) only fill in if currently empty; notes-type
  // fields append the new text after whatever's already there so nothing
  // typed in manually is ever lost. A new guardian is added only if its
  // email isn't already on the existing record.
  async function mergeIntoExisting(row: ParsedRow, existingId: string): Promise<boolean> {
    const detailRes = await fetch(`/api/participants/${existingId}`);
    if (!detailRes.ok) return false;
    const existing = await detailRes.json();

    const patch: Record<string, unknown> = {};
    if (!existing.groupName && row.groupName) patch.groupName = row.groupName;
    if (!existing.dateOfBirth && row.dateOfBirthIso) patch.dateOfBirth = row.dateOfBirthIso;

    const noteFields = ["allergies", "medsNotes", "chronicIssues", "otherNotes"] as const;
    for (const field of noteFields) {
      const incoming = row[field];
      if (!incoming) continue;
      const current = existing[field] as string | null;
      patch[field] = current ? `${current} | ${incoming}` : incoming;
    }

    if (Object.keys(patch).length > 0) {
      const patchRes = await fetch(`/api/participants/${existingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!patchRes.ok) return false;
    }

    if (row.guardianEmail) {
      const existingEmails = new Set(
        ((existing.guardians ?? []) as { email: string }[]).map((g) => g.email.trim().toLowerCase())
      );
      if (!existingEmails.has(row.guardianEmail.trim().toLowerCase())) {
        await fetch(`/api/participants/${existingId}/guardians`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: row.guardianName || undefined, email: row.guardianEmail }),
        });
      }
    }

    return true;
  }

  async function handleImport() {
    setImporting(true);
    let created = 0;
    let merged = 0;
    let skipped = 0;
    let failed = 0;

    await Promise.all(
      importableRows.map(async (row) => {
        const action = actionFor(row);
        if (action === "skip") {
          skipped++;
          return;
        }
        try {
          if (action === "merge" && row.duplicateOf) {
            const ok = await mergeIntoExisting(row, row.duplicateOf.id);
            if (ok) merged++;
            else failed++;
            return;
          }
          const res = await fetch(`/api/events/${eventId}/participants`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: row.name,
              groupName: row.groupName || undefined,
              dateOfBirth: row.dateOfBirthIso || undefined,
              allergies: row.allergies || undefined,
              medsNotes: row.medsNotes || undefined,
              chronicIssues: row.chronicIssues || undefined,
              otherNotes: row.otherNotes || undefined,
              guardians: row.guardianEmail
                ? [{ name: row.guardianName || undefined, email: row.guardianEmail }]
                : [],
            }),
          });
          if (res.ok) created++;
          else failed++;
        } catch {
          failed++;
        }
      })
    );

    setImporting(false);
    setCreatedCount(created);
    setMergedCount(merged);
    setSkippedCount(skipped);
    setFailedCount(failed);
    setDone(true);
  }

  if (done) {
    return (
      <div className="mx-auto max-w-2xl p-4 md:p-8">
        <p className="mb-2 text-[14px] text-pine">
          {t("participantImportPage.doneMessage", { count: String(createdCount) })}
        </p>
        {mergedCount > 0 && (
          <p className="mb-2 text-[14px] text-ink">
            {t("participantImportPage.doneMerged", { count: String(mergedCount) })}
          </p>
        )}
        {skippedCount > 0 && (
          <p className="mb-2 text-[14px] text-ink-secondary">
            {t("participantImportPage.doneSkipped", { count: String(skippedCount) })}
          </p>
        )}
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
              valid: String(importableRows.length),
              invalid: String(invalidCount),
            })}
            {duplicateCount > 0 &&
              " " + t("participantImportPage.duplicatesFound", { count: String(duplicateCount) })}
          </p>

          {duplicateCount > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <label className="text-[13px] text-ink-secondary">{t("participantImportPage.bulkActionLabel")}</label>
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) applyActionToAllDuplicates(e.target.value as RowAction);
                  e.target.value = "";
                }}
                className="rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[13px] text-ink"
              >
                <option value="" disabled>
                  {t("participantImportPage.bulkActionPlaceholder")}
                </option>
                <option value="skip">{t("participantImportPage.actionSkip")}</option>
                <option value="merge">{t("participantImportPage.actionMerge")}</option>
                <option value="create">{t("participantImportPage.actionCreateAnyway")}</option>
              </select>
            </div>
          )}

          <div className="mb-4 overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="border-b border-mist text-left">
                  <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("common.name")}</th>
                  <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantsPage.colGroup")}</th>
                  <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantsPage.dobLabel")}</th>
                  <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantImportPage.field.guardianName")}</th>
                  <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantDetail.guardianEmailLabel")}</th>
                  <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantImportPage.colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.index}
                    className={
                      "border-b border-mist/60 " +
                      (row.errors.length > 0 ? "bg-red-50" : row.duplicateOf ? "bg-amber-50" : "")
                    }
                  >
                    <td className="p-2 text-[14px] text-ink">{row.name || "—"}</td>
                    <td className="p-2 text-[14px] text-ink-secondary">{row.groupName || "—"}</td>
                    <td className="p-2 text-[14px] text-ink-secondary">
                      {row.dateOfBirthRaw ? (row.dateOfBirthIso ?? `${row.dateOfBirthRaw} ⚠`) : "—"}
                    </td>
                    <td className="p-2 text-[14px] text-ink-secondary">{row.guardianName || "—"}</td>
                    <td className="p-2 text-[14px] text-ink-secondary">{row.guardianEmail || "—"}</td>
                    <td className="p-2 text-[13px]">
                      {row.errors.length > 0 ? (
                        <span className="text-red-600">
                          {row.errors.map((e) => t(`participantImportPage.error.${e}`)).join(", ")}
                        </span>
                      ) : row.duplicateOf ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-amber-700">
                            {t("participantImportPage.duplicateOf", {
                              group: row.duplicateOf.groupName || "—",
                            })}
                          </span>
                          <select
                            value={actionFor(row)}
                            onChange={(e) =>
                              setRowOverrides((prev) => ({ ...prev, [row.index]: e.target.value as RowAction }))
                            }
                            className="rounded-lg border border-mist bg-paper px-2 py-1 text-[12px] text-ink"
                          >
                            <option value="skip">{t("participantImportPage.actionSkip")}</option>
                            <option value="merge">{t("participantImportPage.actionMerge")}</option>
                            <option value="create">{t("participantImportPage.actionCreateAnyway")}</option>
                          </select>
                        </div>
                      ) : (
                        <span className="text-pine">{t("participantImportPage.statusOk")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleImport}
            disabled={importing || importableRows.length === 0}
            className="rounded-lg bg-ember px-5 py-2.5 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50"
          >
            {importing ? t("common.loading") : t("participantImportPage.importButton")}
          </button>
        </>
      )}
    </div>
  );
}
