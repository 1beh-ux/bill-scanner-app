// Planning import -- the pure half (docs/planning-helper-module-design.md, "Import").
// Table parsing and header guessing run in the browser; value parsing and
// buildImportPlan run on the server (planning-import-run.ts executes the plan),
// so preview (dry run) and the real import share one code path.

import type { PlanImportTarget, PlanWindowKind } from "@/lib/planning";

// ---- fields -----------------------------------------------------------------

export type ImportField = { key: string; required?: boolean; aliases: string[] };

// Aliases are compared without diacritics, lowercase. Labels: planImport.field.<key>.
export const IMPORT_FIELDS: Record<PlanImportTarget, ImportField[]> = {
  schedule: [
    { key: "date", required: true, aliases: ["datum", "den", "date", "day"] },
    { key: "time", aliases: ["cas", "time", "kdy", "od-do", "od - do"] },
    { key: "start", aliases: ["zacatek", "od", "cas od", "start", "from", "begin"] },
    { key: "end", aliases: ["konec", "do", "cas do", "end", "to", "until"] },
    { key: "duration", aliases: ["delka", "trvani", "delka (min)", "minut", "duration", "min"] },
    { key: "activity", required: true, aliases: ["aktivita", "program", "nazev", "cinnost", "blok", "activity", "name", "title"] },
    { key: "window", aliases: ["okno", "cast dne", "faze", "blok dne", "window", "section"] },
    { key: "leader", aliases: ["vedouci", "vede", "garant", "leader", "lead"] },
    { key: "location", aliases: ["misto", "kde", "lokace", "location", "place", "where"] },
    { key: "groups", aliases: ["skupina", "skupiny", "oddil", "druzina", "group", "groups"] },
    { key: "primaryCategory", aliases: ["kategorie", "hlavni kategorie", "typ", "category", "primary category"] },
    { key: "secondaryCategory", aliases: ["vedlejsi kategorie", "podkategorie", "secondary category"] },
    { key: "description", aliases: ["popis", "obsah", "description"] },
    { key: "notes", aliases: ["poznamka", "poznamky", "note", "notes"] },
  ],
  activities: [
    { key: "name", required: true, aliases: ["nazev", "aktivita", "program", "cinnost", "name", "activity", "title"] },
    { key: "duration", aliases: ["delka", "trvani", "delka (min)", "minut", "duration", "min"] },
    { key: "primaryCategory", aliases: ["kategorie", "hlavni kategorie", "typ", "category", "primary category"] },
    { key: "secondaryCategory", aliases: ["vedlejsi kategorie", "podkategorie", "secondary category"] },
    { key: "leader", aliases: ["vedouci", "vede", "garant", "leader"] },
    { key: "location", aliases: ["misto", "kde", "lokace", "location", "place"] },
    { key: "description", aliases: ["popis", "obsah", "description"] },
    { key: "energy", aliases: ["narocnost", "energie", "energy", "intenzita"] },
    { key: "repeatable", aliases: ["opakovatelna", "opakovat", "vicekrat", "repeatable"] },
  ],
  leaders: [
    { key: "name", required: true, aliases: ["jmeno", "vedouci", "prezdivka", "name", "leader"] },
    { key: "role", aliases: ["role", "funkce", "pozice"] },
    { key: "phone", aliases: ["telefon", "tel", "mobil", "phone"] },
    { key: "color", aliases: ["barva", "color", "colour"] },
    { key: "notes", aliases: ["poznamka", "poznamky", "notes", "note"] },
  ],
  locations: [
    { key: "name", required: true, aliases: ["nazev", "misto", "name", "location", "place"] },
    { key: "capacity", aliases: ["kapacita", "pocet mist", "capacity"] },
    { key: "notes", aliases: ["poznamka", "poznamky", "notes", "note"] },
  ],
  categories: [
    { key: "name", required: true, aliases: ["nazev", "kategorie", "name", "category"] },
    { key: "group", aliases: ["skupina", "typ", "hlavni/vedlejsi", "group", "type"] },
    { key: "color", aliases: ["barva", "color", "colour"] },
    { key: "targetPercent", aliases: ["cil", "cil %", "cil (%)", "podil", "procento", "target", "target %"] },
    { key: "countInAnalysis", aliases: ["analyza", "do analyzy", "merit", "pocitat", "analyze", "count"] },
  ],
};

export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** One field per column: exact alias match first, then the longest alias contained in the header. */
export function guessMapping(headers: string[], target: PlanImportTarget): string[] {
  const fields = IMPORT_FIELDS[target];
  const used = new Set<string>();
  const result = headers.map(() => "");
  const pass = (match: (h: string, alias: string) => boolean) =>
    headers.forEach((raw, i) => {
      if (result[i]) return;
      const h = fold(raw);
      let best: { key: string; len: number } | null = null;
      for (const f of fields) {
        if (used.has(f.key)) continue;
        for (const a of f.aliases) if (match(h, a) && (!best || a.length > best.len)) best = { key: f.key, len: a.length };
      }
      if (best) {
        result[i] = best.key;
        used.add(best.key);
      }
    });
  pass((h, a) => h === a);
  pass((h, a) => a.length >= 3 && h.includes(a));
  return result;
}

// ---- table parsing ----------------------------------------------------------

/**
 * Pasted text -> rows. Tab-separated (Sheets/Excel copy) unless no tabs, then
 * ; or , -- whichever splits the first line into more columns. CSV quoting
 * ("a;b", "" escapes, newlines inside quotes) is honored.
 */
export function parseTable(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const count = (ch: string) => firstLine.split(ch).length;
  const delim = firstLine.includes("\t") ? "\t" : count(";") >= count(",") && count(";") > 1 ? ";" : count(",") > 1 ? "," : "\t";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

// ---- value parsing ----------------------------------------------------------

/** "9", "9h", "9:00", "09.00", "9:00:00", "9,30", or a Sheets day fraction "0.375" -> minutes. */
export function parseTimeOfDay(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s*(h|hod\.?|hodin)$/, "");
  if (/^0?[.,]\d+$/.test(s)) {
    const frac = Number(s.replace(",", "."));
    return frac < 1 ? Math.round(frac * 1440) : null;
  }
  const m = /^(\d{1,2})(?:[:.,](\d{2})(?::\d{2})?)?$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

/** "9:00-10:30", "9.00 – 10.30", "9-10" -> start/end minutes. */
export function parseTimeRange(raw: string): { start: number; end: number } | null {
  const parts = raw.split(/\s*[-–—]\s*/);
  if (parts.length !== 2) return null;
  const start = parseTimeOfDay(parts[0]);
  const end = parseTimeOfDay(parts[1]);
  return start !== null && end !== null && end > start ? { start, end } : null;
}

/** "45", "45 min", "45'", "1:30", "1,5 h", "1h30", "1 h 30 min" -> minutes. */
export function parseDuration(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  let m = /^(\d+):(\d{2})$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d+(?:[.,]\d+)?)\s*(?:h|hod\.?|hodin[ay]?)\s*(?:(\d+)\s*(?:m|min\.?|minut)?)?$/.exec(s);
  if (m) return Math.round(Number(m[1].replace(",", ".")) * 60) + (m[2] ? Number(m[2]) : 0);
  m = /^(\d+)\s*(?:m|min\.?|minut|')?$/.exec(s);
  return m ? Number(m[1]) : null;
}

/**
 * Czech-style dates, weekday words ignored: "10.7.2026", "10. 7.", "Po 10.7.",
 * "2026-07-10", "10/7/2026" (day first). Missing year -> `year`. -> "YYYY-MM-DD".
 */
export function parseDate(raw: string, year: number): string | null {
  const s = raw.trim();
  let d: number, m: number, y: number;
  const iso = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  const cz = /(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]?\s*(\d{4})?/.exec(s);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (cz) [d, m, y] = [Number(cz[1]), Number(cz[2]), cz[3] ? Number(cz[3]) : year];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

export function parseBool(raw: string): boolean | null {
  const s = fold(raw);
  if (["ano", "a", "yes", "y", "true", "1", "x", "✓"].includes(s)) return true;
  if (["ne", "n", "no", "false", "0", ""].includes(s)) return false;
  return null;
}

export function parseGroupNames(raw: string): string[] {
  return [...new Set(raw.split(/[,;/]/).map((g) => g.trim()).filter(Boolean))];
}

// ---- schedule layout ----------------------------------------------------------

export type TimedRow = { index: number; start: number; end: number; windowName?: string };
export type LaidOutWindow<R extends TimedRow> = {
  name: string;
  startMin: number;
  endMin: number;
  kind: PlanWindowKind;
  slots: { durationMin: number; rows: R[] }[];
};

const autoWindowName = (start: number) => (start < 12 * 60 ? "Dopoledne" : start < 18 * 60 ? "Odpoledne" : "Večer");

/**
 * One day's timed rows -> windows of back-to-back slots (the board's model:
 * a window is a run of consecutive slots, rows starting together are parallel
 * branches of one slot). A gap starts a new window; rows that overlap without
 * starting together go into a parallel window (the board's conflict check then
 * flags any shared leader/location/group). Parallel rows with different lengths
 * share the longest -- reported via `unequal`.
 */
export function layoutDay<R extends TimedRow>(rows: R[]): { windows: LaidOutWindow<R>[]; unequal: R[][] } {
  const slots = new Map<string, R[]>();
  for (const r of [...rows].sort((a, b) => a.start - b.start || a.index - b.index)) {
    const key = `${r.windowName ?? ""}\u0000${r.start}`;
    slots.set(key, [...(slots.get(key) ?? []), r]);
  }
  const chains: (LaidOutWindow<R> & { explicitName?: string })[] = [];
  const unequal: R[][] = [];
  for (const group of slots.values()) {
    const start = group[0].start;
    const end = Math.max(...group.map((r) => r.end));
    if (group.some((r) => r.end !== end)) unequal.push(group);
    const name = group[0].windowName;
    const chain = chains.find((c) => c.endMin === start && c.explicitName === name);
    const slot = { durationMin: end - start, rows: group };
    if (chain) {
      chain.slots.push(slot);
      chain.endMin = end;
    } else {
      chains.push({ name: name || autoWindowName(start), explicitName: name, startMin: start, endMin: end, kind: "flexible", slots: [slot] });
    }
  }
  return {
    windows: chains
      .sort((a, b) => a.startMin - b.startMin)
      .map((c) => ({ name: c.name, startMin: c.startMin, endMin: c.endMin, kind: c.kind, slots: c.slots })),
    unequal,
  };
}

/**
 * A category cell -> names with optional minutes: "Teorie 10, Praxe 20",
 * "Teorie (10 min); Praxe", "Hra". Minutes = a trailing number.
 */
export function parseCategoryList(raw: string): { name: string; minutes: number | null }[] {
  return raw
    .split(/[,;/]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = /^(.*?)[\s:(]+(\d+)\s*(?:min\.?|m|')?\s*\)?$/i.exec(part);
      const minutes = m ? Number(m[2]) : null;
      return m && m[1].trim() && minutes! > 0 && minutes! <= 1440 ? { name: m[1].trim(), minutes } : { name: part, minutes: null };
    });
}
