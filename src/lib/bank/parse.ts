// Banka: bank export -> transactions (docs/bank-reconciliation.md). Pure functions (no DB): text
// decoding, delimiter + header-row detection, column recognition (the import pipeline's
// guessMappingFor / fold), Czech dates and amounts, external ids. Self-check: scripts/check-bank-parse.ts.
import crypto from "crypto";
import { fold, guessMappingFor, parseTable, type ImportField } from "@/lib/planning-import";

export type ParsedTx = {
  externalId: string;
  bookingDate: string; // YYYY-MM-DD
  valueDate: string | null;
  amount: number; // signed, minus = outgoing
  currency: string;
  originalAmount: number | null;
  originalCurrency: string | null;
  counterpartyAccount: string | null;
  counterpartyBankCode: string | null;
  counterpartyName: string | null;
  vs: string | null;
  ks: string | null;
  ss: string | null;
  message: string | null;
  note: string | null;
  bankType: string | null;
};
export type RowResult = { line: number; ok: true; tx: ParsedTx } | { line: number; ok: false; reason: string; raw: string };

// Targets and header aliases (folded: no diacritics, lower case).
export const BANK_FIELDS: ImportField[] = [
  { key: "date", required: true, aliases: ["datum", "datum zauctovani", "datum pohybu", "datum transakce", "date", "booking date", "zauctovano"] },
  { key: "valueDate", aliases: ["valuta", "datum valuty", "value date"] },
  { key: "amount", aliases: ["castka", "objem", "amount", "suma", "castka v mene uctu"] },
  { key: "debit", aliases: ["vydaj", "debet", "odchozi", "odchozi castka", "debit", "vyber"] },
  { key: "credit", aliases: ["prijem", "kredit", "prichozi", "prichozi castka", "credit", "vklad"] },
  { key: "direction", aliases: ["smer", "d/c", "debet/kredit", "+/-", "znamenko"] },
  { key: "currency", aliases: ["mena", "currency", "mena uctu"] },
  { key: "counterAccount", aliases: ["protiucet", "cislo uctu protistrany", "ucet protistrany", "account", "cislo protiuctu", "protiucet/kod banky"] },
  { key: "bankCode", aliases: ["kod banky", "banka", "kod banky protiuctu", "bank code"] },
  { key: "counterName", aliases: ["nazev protiuctu", "protistrana", "prijemce/platce", "nazev protistrany", "name", "obchodnik", "nazev uctu protistrany"] },
  { key: "vs", aliases: ["vs", "variabilni symbol", "var. symbol"] },
  { key: "ks", aliases: ["ks", "konstantni symbol"] },
  { key: "ss", aliases: ["ss", "specificky symbol"] },
  { key: "message", aliases: ["zprava pro prijemce", "zprava", "message", "zprava pro prijemce / platce"] },
  { key: "note", aliases: ["poznamka", "popis", "komentar", "upresneni", "description", "uzivatelska identifikace", "informace k platbe"] },
  { key: "type", aliases: ["typ", "typ pohybu", "druh", "typ transakce", "type"] },
  { key: "externalRef", aliases: ["id pohybu", "id transakce", "reference", "id", "cislo transakce"] },
  { key: "originalAmount", aliases: ["puvodni castka", "castka v puvodni mene", "original amount"] },
  { key: "originalCurrency", aliases: ["puvodni mena", "original currency"] },
];
const FIELD_KEYS = new Set(BANK_FIELDS.map((f) => f.key));

// ---- text ---------------------------------------------------------------------------------------

/** UTF-8 (with or without BOM); anything that isn't valid UTF-8 is read as CP1250 (Czech banks). */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes.subarray(3));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1250").decode(bytes);
  }
}

/** ; , or tab -- the one splitting the most of the first 20 lines into the same (>1) number of cells. */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  let best = { d: ";", score: -1 };
  for (const d of [";", "\t", ","]) {
    const counts = lines.map((l) => l.split(d).length).filter((n) => n > 1);
    if (!counts.length) continue;
    // The most common column count and how many lines have it (the table, not the info lines).
    const freq = new Map<number, number>();
    for (const n of counts) freq.set(n, (freq.get(n) ?? 0) + 1);
    const [cols, lines_] = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const score = lines_ * 100 + cols;
    if (score > best.score) best = { d, score };
  }
  return best.d;
}

/** File / pasted text -> rows of cells. */
export const toRows = (text: string) => parseTable(text, detectDelimiter(text));

/** Index of the header row: the first (of 30) where at least 3 cells are known column names; -1 = none. */
export function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    if (guessMappingFor(rows[i], BANK_FIELDS).filter(Boolean).length >= 3) return i;
  }
  return -1;
}

export const guessBankMapping = (headers: string[]) => guessMappingFor(headers, BANK_FIELDS);

// ---- values -------------------------------------------------------------------------------------

/** 16.10.2026, 16. 10. 2026, 16.10.26, 2026-10-16(+0200), 16/10/2026 (time after it ignored) -> YYYY-MM-DD. */
export function parseBankDate(raw: string): string | null {
  const s = (raw ?? "").trim();
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (r) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = /^(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]\s*(\d{2}|\d{4})(?:\s|$)/.exec(s))) [d, m, y] = [+r[1], +r[2], r[3].length === 2 ? 2000 + +r[3] : +r[3]];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/**
 * Czech / international amounts -> number: "1 234,56" (also with a no-break space), "-1234.56",
 * "1.234,56 Kč", "(1 234,56)" = negative, "+50", "1,234.56". Anything else -> null, never a guess.
 */
export function parseBankAmount(raw: string): number | null {
  let s = (raw ?? "").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[\s  ']/g, "").replace(/[A-Za-zÀ-ž€$£]+\.?$/u, "").replace(/^[A-Za-zÀ-ž€$£]+/u, "");
  if (/^[-−]/.test(s)) {
    neg = !neg;
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    neg = !neg;
    s = s.slice(0, -1);
  } else if (s.startsWith("+")) s = s.slice(1);
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // The later separator is the decimal one.
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    if ((s.match(/,/g) ?? []).length > 1) return null;
    s = s.replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, ""); // 1.234.567
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return neg ? -n : n;
}

const clean = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t ? t : null;
};
const normalizeSymbol = (v: string | undefined) => clean((v ?? "").replace(/\D/g, "").replace(/^0+/, ""));
// "Výdaj" / "D" / "-" = outgoing; "Příjem" / "C" / "+" = incoming; else unknown.
function directionSign(raw: string | undefined): 1 | -1 | null {
  const v = fold(raw ?? "");
  if (!v) return null;
  if (/^(d|db|dr|debet|debit|vydaj|odchozi|-|minus|vyber)/.test(v)) return -1;
  if (/^(c|cr|kredit|credit|prijem|prichozi|\+|plus|vklad)/.test(v)) return 1;
  return null;
}

// ---- rows -> transactions -----------------------------------------------------------------------

/**
 * Data rows (below the header) + mapping (field key per column, "" = ignored) -> per-row results.
 * idPrefix: an "ID pohybu" column gives `${idPrefix}<id>` (fio: for a Fio account, so a Fio CSV and
 * the Fio API never duplicate); otherwise a content hash -- with the occurrence index among identical
 * rows, so two identical 45 Kč coffees on the same day stay two rows.
 */
export function rowsToTransactions(rows: string[][], mapping: string[], opts: { firstLine: number; currency: string; idPrefix: string }): RowResult[] {
  const col = (key: string) => mapping.indexOf(key);
  const has = (key: string) => col(key) >= 0;
  const get = (row: string[], key: string) => (has(key) ? row[col(key)] : undefined);
  const seen = new Map<string, number>();
  return rows.map((row, i) => {
    const line = opts.firstLine + i;
    const raw = row.join(" | ").slice(0, 200);
    const fail = (reason: string): RowResult => ({ line, ok: false, reason, raw });
    if (row.every((c) => !c.trim())) return fail("empty");

    const bookingDate = parseBankDate(get(row, "date") ?? "");
    if (!bookingDate) return fail("bad_date");

    let amount: number | null;
    if (has("amount")) {
      amount = parseBankAmount(get(row, "amount") ?? "");
      if (amount === null) return fail("bad_amount");
      const sign = has("direction") ? directionSign(get(row, "direction")) : null;
      if (sign !== null) amount = sign * Math.abs(amount);
    } else if (has("debit") || has("credit")) {
      const dRaw = clean(get(row, "debit")), cRaw = clean(get(row, "credit"));
      const d = dRaw ? parseBankAmount(dRaw) : 0, c = cRaw ? parseBankAmount(cRaw) : 0;
      if (d === null || c === null) return fail("bad_amount");
      if (!d && !c) return fail("no_amount");
      amount = Math.abs(c) - Math.abs(d);
    } else return fail("no_amount");

    let counterpartyAccount = clean(get(row, "counterAccount"));
    let counterpartyBankCode = clean(get(row, "bankCode"));
    // "123-4567890/0800" in one column.
    const split = counterpartyAccount ? /^([\d-]+)\s*\/\s*(\d{4})$/.exec(counterpartyAccount) : null;
    if (split) [counterpartyAccount, counterpartyBankCode] = [split[1], counterpartyBankCode ?? split[2]];

    const origRaw = clean(get(row, "originalAmount"));
    const originalAmount = origRaw ? parseBankAmount(origRaw) : null;
    const tx: Omit<ParsedTx, "externalId"> = {
      bookingDate,
      valueDate: parseBankDate(get(row, "valueDate") ?? ""),
      amount: Math.round(amount * 100) / 100,
      currency: (clean(get(row, "currency")) ?? opts.currency).toUpperCase().replace("KČ", "CZK"),
      originalAmount: originalAmount === null ? null : Math.abs(originalAmount),
      originalCurrency: clean(get(row, "originalCurrency"))?.toUpperCase() ?? null,
      counterpartyAccount,
      counterpartyBankCode,
      counterpartyName: clean(get(row, "counterName")),
      vs: normalizeSymbol(get(row, "vs")),
      ks: normalizeSymbol(get(row, "ks")),
      ss: normalizeSymbol(get(row, "ss")),
      message: clean(get(row, "message")),
      note: clean(get(row, "note")),
      bankType: clean(get(row, "type")),
    };
    const ref = clean(get(row, "externalRef"));
    let externalId: string;
    if (ref) externalId = `${opts.idPrefix}${ref}`;
    else {
      const key = [tx.bookingDate, tx.amount.toFixed(2), tx.counterpartyAccount ?? "", tx.vs ?? "", fold(tx.message ?? "").replace(/\s+/g, " ")].join("|");
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      externalId = "h:" + crypto.createHash("sha256").update(`${key}|${n}`).digest("hex").slice(0, 32);
    }
    return { line, ok: true, tx: { externalId, ...tx } };
  });
}

/** A saved / edited mapping -> known keys only, one column per key. */
export function cleanMapping(mapping: unknown, width: number): string[] {
  const used = new Set<string>();
  const arr = Array.isArray(mapping) ? mapping : [];
  return Array.from({ length: width }, (_, i) => {
    const k = typeof arr[i] === "string" ? arr[i] : "";
    if (!FIELD_KEYS.has(k) || used.has(k)) return "";
    used.add(k);
    return k;
  });
}

/** What the mapping still lacks to read amounts and dates; [] = ok. */
export function mappingProblems(mapping: string[]): string[] {
  const p: string[] = [];
  if (!mapping.includes("date")) p.push("missing_date");
  if (!mapping.includes("amount") && !mapping.includes("debit") && !mapping.includes("credit")) p.push("missing_amount");
  return p;
}
