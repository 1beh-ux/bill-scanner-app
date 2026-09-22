"use client";

import { useEffect, useMemo, useState, use } from "react";
import { useTranslations } from "@/lib/i18n";
import { type ParticipantFieldDef } from "@/lib/participant-fields";
import { FIXED_PARTICIPANT_FIELDS } from "@/lib/fixed-participant-fields";
import { driveErrorText } from "@/lib/drive-error-messages";
import { splitFullName, fullNameFrom } from "@/lib/participant-name";

// Import targets are now fully data-driven: every field flagged with the
// `import` surface (builtin/guardian/custom -- see
// src/lib/fixed-participant-fields.ts) is fetched and offered, replacing
// the old hardcoded 5-item FIXED_TARGETS list. Structural targets (name,
// group, DOB, guardian identity) are still resolved by key, but the key
// itself is looked up from FIXED_PARTICIPANT_FIELDS instead of hardcoded,
// so it stays correct if those fixed keys ever change. FieldTarget is
// deliberately a bare string, not a closed union, since custom field keys
// aren't known at compile time.
type FieldTarget = string;
const IGNORE = "ignore";

function fixedKey(match: (f: (typeof FIXED_PARTICIPANT_FIELDS)[number]) => boolean): string {
  return FIXED_PARTICIPANT_FIELDS.find(match)?.key ?? "";
}
const NAME_FIELD = fixedKey((f) => f.builtinProp === "name");
const FIRST_NAME_FIELD = fixedKey((f) => f.builtinProp === "firstName");
const LAST_NAME_FIELD = fixedKey((f) => f.builtinProp === "lastName");
const GROUP_FIELD = fixedKey((f) => f.builtinProp === "groupName");
const DOB_FIELD = fixedKey((f) => f.builtinProp === "dateOfBirth");
const GUARDIAN_NAME_FIELD = fixedKey((f) => f.guardianProp === "name");
const GUARDIAN_EMAIL_FIELD = fixedKey((f) => f.guardianProp === "email");
const GUARDIAN_RELATIONSHIP_FIELD = fixedKey((f) => f.guardianProp === "relationship");
const GUARDIAN_PHONE_FIELD = fixedKey((f) => f.guardianProp === "phone");

const EMAIL_RE = /\S+@\S+\.\S+/;
const DATE_SEP_RE = /^(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{4})$/;

function guessTarget(header: string, fields: ParticipantFieldDef[]): FieldTarget {
  const h = header.trim().toLowerCase();
  if (!h) return IGNORE;
  if (h.includes("narozen") || h.includes("datum nar") || h.includes("dob") || h.includes("birth")) return DOB_FIELD;
  if (h.includes("telefon") || h.includes("phone")) return GUARDIAN_PHONE_FIELD;
  if (h.includes("vztah") || h.includes("relationship")) return GUARDIAN_RELATIONSHIP_FIELD;
  if (h.includes("rodič") || h.includes("rodic") || h.includes("zástupce") || h.includes("zastupce") || h.includes("guardian"))
    return GUARDIAN_NAME_FIELD;
  // "Příjmení"/"surname" is unambiguous on its own -- checked before the generic
  // jméno/name match below, which would otherwise never be reached (every Czech
  // "příjmení" header also satisfies a naive "contains jméno" check once accents
  // are folded, so order matters here more than it looks).
  if (h.includes("příjmení") || h.includes("prijmeni") || h.includes("surname") || h.includes("last name")) return LAST_NAME_FIELD;
  if (h.includes("křestní") || h.includes("krestni") || h.includes("first name")) return FIRST_NAME_FIELD;
  if (h.includes("jméno") || h.includes("jmeno") || h.includes("name")) return NAME_FIELD;
  if (h.includes("skupina") || h.includes("oddíl") || h.includes("oddil") || h.includes("group")) return GROUP_FIELD;
  if (h.includes("e-mail") || h.includes("email") || h.includes("kontakt")) return GUARDIAN_EMAIL_FIELD;
  // Fall back to a substring match against each importable field's own
  // label -- covers e.g. a column literally named "Velikost trika"
  // without needing a bespoke heuristic per field.
  const byLabel = fields.find((f) => h.includes(f.label.toLowerCase()));
  if (byLabel) return byLabel.key;
  return IGNORE;
}

// Diacritics-insensitive (Part 6: duplicate matching is "lastName + firstName
// (diacritics-insensitive)") -- "Novak" typed without the accent still matches "Novák".
function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

// Every column mapped to a target is combined, not just the first -- lets
// e.g. separate "Jméno" and "Příjmení" columns both map to "name". For
// custom-field targets (never for builtin/guardian ones), more than one
// source column gets labeled with its own header so the merged text still
// says which column said what -- covers free-text fields like allergies
// where losing provenance would be confusing; harmless for short fields
// like a t-shirt size, which realistically never map from >1 column.
function resolveField(
  cells: string[],
  headers: string[],
  mapping: FieldTarget[],
  target: FieldTarget,
  fields: ParticipantFieldDef[]
): string {
  const matches: { header: string; value: string }[] = [];
  mapping.forEach((m, i) => {
    if (m !== target) return;
    const v = (cells[i] ?? "").trim();
    if (v) matches.push({ header: headers[i]?.trim() || `#${i + 1}`, value: v });
  });
  if (matches.length === 0) return "";
  const isCustomField = fields.find((f) => f.key === target)?.kind === "custom";
  if (matches.length === 1 || !isCustomField) {
    return matches.map((m) => m.value).join(" ");
  }
  return matches.map((m) => `${m.header}: ${m.value}`).join(" | ");
}

// DD/MM vs MM/DD can't be resolved per-row (both parts <=12 is genuinely
// ambiguous) -- instead scan the whole batch once for a row that
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
  dateOfBirth: string | null;
  groupName: string | null;
};

type GuardianRow = { name: string; email: string; relationship: string; phone: string };

type ParsedRow = {
  index: number;
  cells: string[];
  name: string;
  firstName: string;
  lastName: string;
  groupName: string;
  dateOfBirthRaw: string;
  dateOfBirthIso: string | undefined;
  // One entry per guardian e-mail COLUMN that has a value on this row -- Part 6: "If two
  // guardian e-mail columns exist, create two guardians." Paired by position: the Nth
  // mapped e-mail column goes with the Nth mapped name/phone/relationship column.
  guardians: GuardianRow[];
  customFieldValues: Record<string, string>;
  errors: string[];
  duplicateOf: ExistingParticipant | null;
};

/** Every column mapped to `target`, in mapping order, with its raw (untrimmed-check) value. */
function columnsFor(cells: string[], mapping: FieldTarget[], target: FieldTarget): string[] {
  const out: string[] = [];
  mapping.forEach((m, i) => {
    if (m !== target) return;
    const v = (cells[i] ?? "").trim();
    if (v) out.push(v);
  });
  return out;
}

function resolveGuardians(cells: string[], mapping: FieldTarget[]): GuardianRow[] {
  const emails = columnsFor(cells, mapping, GUARDIAN_EMAIL_FIELD);
  const names = columnsFor(cells, mapping, GUARDIAN_NAME_FIELD);
  const phones = columnsFor(cells, mapping, GUARDIAN_PHONE_FIELD);
  const relationships = columnsFor(cells, mapping, GUARDIAN_RELATIONSHIP_FIELD);
  return emails.map((email, i) => ({ email, name: names[i] ?? "", phone: phones[i] ?? "", relationship: relationships[i] ?? "" }));
}

type RowAction = "create" | "skip" | "merge";

// Source-agnostic: both the paste tab (tab-split lines) and the Google
// Sheets tab (values.get's own array-of-arrays) end up as the same
// string[][] shape before reaching this — one mapping/preview/import
// pipeline for both.
function buildRows(
  cellRows: string[][],
  headers: string[],
  mapping: FieldTarget[],
  existingParticipants: ExistingParticipant[],
  fields: ParticipantFieldDef[]
): ParsedRow[] {
  const resolve = (cells: string[], target: FieldTarget) => resolveField(cells, headers, mapping, target, fields);
  const nonEmptyRows = cellRows.filter((cells) => cells.some((c) => c.trim()));
  const rawDobs = nonEmptyRows.map((cells) => resolve(cells, DOB_FIELD));
  const dateOrder = detectDateOrder(rawDobs);
  // Grouped, not single-valued: two existing participants can share a name (twins,
  // coincidence) -- date of birth (when the row has one) picks the right one instead
  // of always taking whichever was inserted first.
  const existingByName = new Map<string, ExistingParticipant[]>();
  for (const p of existingParticipants) {
    const key = normalizeName(p.name);
    const list = existingByName.get(key);
    if (list) list.push(p);
    else existingByName.set(key, [p]);
  }

  return nonEmptyRows.map((cells, index) => {
    // Dedicated Jméno/Příjmení columns win when mapped; otherwise split the combined
    // "Jméno a příjmení" column the same way scripts/split-participant-names.ts does
    // (Part 6: "combined, split by the rule of Part 1") -- never guessed beyond that
    // rule, an ambiguous combined name just lands whole in lastName like the script.
    const mappedFirst = resolve(cells, FIRST_NAME_FIELD);
    const mappedLast = resolve(cells, LAST_NAME_FIELD);
    const combinedName = resolve(cells, NAME_FIELD);
    let firstName = mappedFirst;
    let lastName = mappedLast;
    if (!firstName && !lastName && combinedName) {
      const split = splitFullName(combinedName);
      firstName = split.firstName;
      lastName = split.lastName ?? "";
    }
    const name = fullNameFrom(firstName, lastName) || combinedName;
    const guardians = resolveGuardians(cells, mapping);
    const dateOfBirthRaw = resolve(cells, DOB_FIELD);
    const errors: string[] = [];
    if (!name) errors.push("missing_name");
    // A header mapped to the wrong kind of target shows up as a value that plainly
    // isn't one -- Part 6: "a header must never be mapped to a target of an obviously
    // different kind" (checked here rather than at mapping time so it re-evaluates
    // live as values come from different rows/cells, not just the header text).
    if (guardians.some((g) => !EMAIL_RE.test(g.email))) errors.push("invalid_email");
    if (firstName && EMAIL_RE.test(firstName)) errors.push("name_looks_like_email");
    // Only kind=custom fields store into customFieldValues -- builtin
    // (name/group/DOB) and guardian fields are resolved into their own
    // ParsedRow properties above/below instead.
    const customFieldValues: Record<string, string> = {};
    for (const f of fields) {
      if (f.kind !== "custom") continue;
      const v = resolve(cells, f.key);
      if (v) customFieldValues[f.key] = v;
    }
    const dateOfBirthIso = formatDob(dateOfBirthRaw, dateOrder);
    return {
      index,
      cells,
      name,
      firstName,
      lastName,
      groupName: resolve(cells, GROUP_FIELD),
      dateOfBirthRaw,
      dateOfBirthIso,
      guardians,
      customFieldValues,
      errors,
      duplicateOf: name ? matchExisting(existingByName.get(normalizeName(name)), dateOfBirthIso) : null,
    };
  });
}

/** Among same-named existing participants, prefer the one whose DOB matches the row's. */
function matchExisting(candidates: ExistingParticipant[] | undefined, dateOfBirthIso: string | undefined): ExistingParticipant | null {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1 || !dateOfBirthIso) return candidates[0];
  return candidates.find((p) => p.dateOfBirth?.slice(0, 10) === dateOfBirthIso) ?? candidates[0];
}

type SourceTab = "paste" | "sheets";

export default function ParticipantImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = use(params);
  const { t } = useTranslations();

  const [tab, setTab] = useState<SourceTab>("paste");

  const [pasteText, setPasteText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<FieldTarget[]>([]);
  const [cellRows, setCellRows] = useState<string[][]>([]);
  const [existingParticipants, setExistingParticipants] = useState<ExistingParticipant[]>([]);
  const [rowOverrides, setRowOverrides] = useState<Record<number, RowAction>>({});

  const [spreadsheetIdInput, setSpreadsheetIdInput] = useState("");
  const [sheetsLoading, setSheetsLoading] = useState(false);
  const [sheetsError, setSheetsError] = useState<string | null>(null);
  // The Google account this event's Drive/Sheets work runs as -- the sheet must be shared with it.
  const [identityEmail, setIdentityEmail] = useState("");

  // Persisted connection (Seznam účastníků import settings) -- set up once,
  // reused on every future import instead of re-pasting and remapping.
  const [savedMapping, setSavedMapping] = useState<Record<string, FieldTarget>>({});
  const [savingConnection, setSavingConnection] = useState(false);
  const [connectionSaved, setConnectionSaved] = useState(false);

  const [importing, setImporting] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const [mergedCount, setMergedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [done, setDone] = useState(false);

  // Every field flagged for the `import` surface -- builtin, guardian, and
  // custom alike (see src/lib/fixed-participant-fields.ts). Data-driven
  // instead of a hardcoded target list, so a newly added importable field
  // is immediately mappable without a code change.
  const [fields, setFields] = useState<ParticipantFieldDef[]>([]);
  const allTargets = useMemo(() => [IGNORE, ...fields.map((f) => f.key)], [fields]);

  useEffect(() => {
    fetch(`/api/events/${eventId}/participants`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setExistingParticipants)
      .catch(() => {});
    fetch(`/api/events/${eventId}/participant-fields?surface=import`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setFields)
      .catch(() => {});
  }, [eventId]);

  useEffect(() => {
    fetch(`/api/events/${eventId}/drive-identity`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setIdentityEmail(d?.identity?.email || ""))
      .catch(() => {});
  }, [eventId]);

  // Prefill from the saved connection, if there is one, and load it
  // straight away -- that's the point of saving it in the first place.
  useEffect(() => {
    fetch(`/api/events/${eventId}/participants/sheet-settings`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const mapping = (d.participantsColumnMapping || {}) as Record<string, FieldTarget>;
        setSavedMapping(mapping);
        if (d.participantsSheetId) {
          setTab("sheets");
          setSpreadsheetIdInput(d.participantsSheetId);
          loadSheet(d.participantsSheetId);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  function loadFromCellRows(rows: string[][], mappingOverride?: Record<string, FieldTarget>) {
    setRowOverrides({});
    if (rows.length === 0) {
      setHeaders([]);
      setMapping([]);
      setCellRows([]);
      return;
    }
    const headerCells = rows[0];
    const remembered = mappingOverride ?? savedMapping;
    setHeaders(headerCells);
    setMapping(headerCells.map((h) => remembered[h.trim()] ?? guessTarget(h, fields)));
    setCellRows(rows.slice(1));
  }

  function handlePasteChange(value: string) {
    setPasteText(value);
    const lines = value.split(/\r?\n/).filter((l) => l.length > 0);
    loadFromCellRows(lines.map((line) => line.split("\t")));
  }

  async function loadSheet(spreadsheetId: string, mappingOverride?: Record<string, FieldTarget>) {
    if (!spreadsheetId.trim()) return;
    setSheetsLoading(true);
    setSheetsError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/health/participants/sheets-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadsheetId: spreadsheetId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        // A stable Drive error code (+ the account used) -> precise translated message.
        setSheetsError(
          data.error
            ? driveErrorText(t, data.error, { identity: data.identity || identityEmail, serviceAccount: data.serviceAccount, folderLabel: undefined })
            : t("participantImportPage.sheetsLoadError")
        );
        return;
      }
      loadFromCellRows([data.headers, ...data.rows], mappingOverride);
    } catch {
      setSheetsError(t("participantImportPage.sheetsLoadError"));
    } finally {
      setSheetsLoading(false);
    }
  }

  function updateMapping(index: number, target: FieldTarget) {
    setRowOverrides({});
    setMapping((prev) => prev.map((v, i) => (i === index ? target : v)));
    setConnectionSaved(false);
  }

  async function saveConnection() {
    if (!spreadsheetIdInput.trim() || headers.length === 0) return;
    setSavingConnection(true);
    const columnMapping: Record<string, FieldTarget> = {};
    headers.forEach((h, i) => {
      if (mapping[i] !== "ignore") columnMapping[h.trim()] = mapping[i];
    });
    const res = await fetch(`/api/events/${eventId}/participants/sheet-settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participantsSheetId: spreadsheetIdInput.trim(),
        participantsColumnMapping: columnMapping,
      }),
    });
    setSavingConnection(false);
    if (res.ok) {
      setSavedMapping(columnMapping);
      setConnectionSaved(true);
    }
  }

  function targetLabel(target: FieldTarget): string {
    if (target === IGNORE) return t("participantImportPage.field.ignore");
    return fields.find((f) => f.key === target)?.label ?? target;
  }

  const rows = useMemo(
    () => buildRows(cellRows, headers, mapping, existingParticipants, fields),
    [cellRows, headers, mapping, existingParticipants, fields]
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
  // (group, date of birth) only fill in if currently empty; every custom
  // field appends the new text after whatever's already there so nothing
  // typed in manually is ever lost. A new guardian is added only if its
  // email isn't already on the existing record.
  async function mergeIntoExisting(row: ParsedRow, existingId: string): Promise<boolean> {
    const detailRes = await fetch(`/api/participants/${existingId}`);
    if (!detailRes.ok) return false;
    const existing = await detailRes.json();

    const patch: Record<string, unknown> = {};
    if (!existing.groupName && row.groupName) patch.groupName = row.groupName;
    if (!existing.dateOfBirth && row.dateOfBirthIso) patch.dateOfBirth = row.dateOfBirthIso;

    const existingCustom = (existing.customFieldValues ?? {}) as Record<string, string>;
    const mergedCustom: Record<string, string> = {};
    for (const [key, incoming] of Object.entries(row.customFieldValues)) {
      const current = existingCustom[key];
      mergedCustom[key] = current ? `${current} | ${incoming}` : incoming;
    }
    if (Object.keys(mergedCustom).length > 0) patch.customFieldValues = mergedCustom;

    if (Object.keys(patch).length > 0) {
      const patchRes = await fetch(`/api/participants/${existingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!patchRes.ok) return false;
    }

    const existingEmails = new Set(
      ((existing.guardians ?? []) as { email: string }[]).map((g) => g.email.trim().toLowerCase())
    );
    await Promise.all(
      row.guardians
        .filter((g) => !existingEmails.has(g.email.trim().toLowerCase()))
        .map((g) =>
          fetch(`/api/participants/${existingId}/guardians`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: g.name || undefined,
              email: g.email,
              relationship: g.relationship || undefined,
              phone: g.phone || undefined,
            }),
          })
        )
    );

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
              firstName: row.firstName || undefined,
              lastName: row.lastName || undefined,
              name: row.name,
              groupName: row.groupName || undefined,
              dateOfBirth: row.dateOfBirthIso || undefined,
              customFieldValues: row.customFieldValues,
              guardians: row.guardians.map((g) => ({
                name: g.name || undefined,
                email: g.email,
                relationship: g.relationship || undefined,
                phone: g.phone || undefined,
              })),
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
        <a href={`/events/${eventId}/participants`} className="text-[14px] text-ember hover:underline">
          {t("participantImportPage.goToParticipants")}
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <a href={`/events/${eventId}/participants`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("participantsPage.centralTitle")}
      </a>

      <h1 className="mb-2 mt-2 text-[22px] font-semibold text-ink">{t("participantImportPage.title")}</h1>

      <div className="mb-4 flex gap-1 border-b border-mist">
        <button
          onClick={() => setTab("paste")}
          className={
            "px-3 py-2 text-[13px] font-medium " +
            (tab === "paste" ? "border-b-2 border-ember text-ink" : "text-ink-secondary hover:text-ink")
          }
        >
          {t("participantImportPage.tabPaste")}
        </button>
        <button
          onClick={() => setTab("sheets")}
          className={
            "px-3 py-2 text-[13px] font-medium " +
            (tab === "sheets" ? "border-b-2 border-ember text-ink" : "text-ink-secondary hover:text-ink")
          }
        >
          {t("participantImportPage.tabSheets")}
        </button>
      </div>

      {tab === "paste" ? (
        <>
          <p className="mb-4 text-[14px] text-ink-secondary">{t("participantImportPage.instructions")}</p>
          <textarea
            value={pasteText}
            onChange={(e) => handlePasteChange(e.target.value)}
            placeholder={t("participantImportPage.pastePlaceholder")}
            className="mb-4 h-40 w-full rounded-lg border border-mist bg-paper-2 p-3 font-mono text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember"
          />
        </>
      ) : (
        <>
          <p className="mb-2 text-[14px] text-ink-secondary">{t("participantImportPage.sheetsInstructions")}</p>
          <p className="mb-3 break-all rounded-lg bg-paper-2 p-2 font-mono text-[13px] text-ink">
            {identityEmail || "…"}
          </p>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={spreadsheetIdInput}
              onChange={(e) => setSpreadsheetIdInput(e.target.value)}
              placeholder={t("participantImportPage.sheetsIdPlaceholder")}
              className="flex-1 rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember"
            />
            <button
              onClick={() => loadSheet(spreadsheetIdInput)}
              disabled={sheetsLoading || !spreadsheetIdInput.trim()}
              className="rounded-lg bg-ember px-4 py-2 text-[13px] font-medium text-white hover:bg-ember-hover disabled:opacity-50"
            >
              {sheetsLoading ? t("common.loading") : t("participantImportPage.sheetsLoadButton")}
            </button>
          </div>
          {sheetsError && <p className="mb-4 text-[13px] text-red-600">{sheetsError}</p>}
        </>
      )}

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
                  {allTargets.map((target) => (
                    <option key={target} value={target}>
                      {targetLabel(target)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {tab === "sheets" && (
            <div className="mb-4 flex items-center gap-2">
              <button
                onClick={saveConnection}
                disabled={savingConnection || !spreadsheetIdInput.trim()}
                className="rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2 disabled:opacity-50"
              >
                {savingConnection ? t("common.loading") : t("participantImportPage.saveConnectionButton")}
              </button>
              {connectionSaved && <span className="text-[13px] text-pine">{t("participantImportPage.connectionSaved")}</span>}
            </div>
          )}

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
                    <td className="p-2 text-[14px] text-ink-secondary">{row.guardians[0]?.name || "—"}</td>
                    <td className="p-2 text-[14px] text-ink-secondary">
                      {row.guardians.length === 0
                        ? "—"
                        : row.guardians.length === 1
                          ? row.guardians[0].email
                          : t("participantImportPage.guardianCount", { count: String(row.guardians.length) })}
                    </td>
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
