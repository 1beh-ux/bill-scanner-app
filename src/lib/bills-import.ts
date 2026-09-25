// Bill import from a table (old Apps Script export or any sheet) -- the pure
// half: fields + header aliases, and value parsers. Server side:
// bills-import-run.ts. Same flow as the participant and planning imports.

import type { ImportField } from "@/lib/planning-import";

export const BILL_IMPORT_FIELDS: ImportField[] = [
  { key: "file", required: true, aliases: ["soubor", "odkaz", "link", "url", "file", "odkaz na soubor", "uctenka", "doklad", "drive"] },
  { key: "merchant", aliases: ["obchodnik", "obchod", "prodejce", "dodavatel", "merchant", "vendor", "nazev"] },
  { key: "date", aliases: ["datum", "datum uctenky", "date", "bill date"] },
  { key: "amount", aliases: ["castka", "celkem", "suma", "cena", "amount", "total", "castka celkem"] },
  { key: "currency", aliases: ["mena", "currency"] },
  { key: "payer", aliases: ["platil", "kdo platil", "platce", "autor", "zaplatil", "payer", "author"] },
  { key: "categories", aliases: ["kategorie", "kategorie a castky", "category", "categories"] },
  { key: "notes", aliases: ["poznamka", "poznamky", "notes", "note", "popis"] },
  { key: "paid", aliases: ["proplaceno", "zaplaceno", "vyplaceno", "paid", "reimbursed"] },
];

/** Drive file id from a link (/file/d/ID, ?id=ID, /document/d/ID, uc?id=) or a bare id. */
export function parseDriveFileId(raw: string): string | null {
  const s = raw.trim();
  const m = /\/d\/([a-zA-Z0-9_-]{10,})/.exec(s) ?? /[?&]id=([a-zA-Z0-9_-]{10,})/.exec(s);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : null;
}

/** "1 234,50 Kč", "1234.5", "-12,00" -> number (2 decimals); null if not a number. */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[^\d,.\-]/g, "");
  if (!s || !/\d/.test(s)) return null;
  // Both separators: the last one is the decimal point ("1.234,50" / "1,234.50").
  if (s.includes(",") && s.includes(".")) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Currency from a code or symbol, also when it's inside an amount cell ("12 €"). */
export function parseCurrency(raw: string): "CZK" | "EUR" | "PLN" | null {
  const s = raw.toLowerCase();
  if (/czk|kč|kc\b/.test(s)) return "CZK";
  if (/eur|€/.test(s)) return "EUR";
  if (/pln|zł|zl\b/.test(s)) return "PLN";
  return null;
}

/**
 * Category cell -> names with optional amounts: "Jídlo" (the whole bill),
 * "Jídlo 200; Doprava 100,50". Split on ; / and newlines only -- a comma is
 * the Czech decimal separator.
 */
export function parseBillCategories(raw: string): { name: string; amount: number | null }[] {
  return raw
    .split(/[;/\n]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((part) => {
      const m = /^(.*?)[\s:(]+(-?\d[\d\s]*(?:[.,]\d+)?)\s*(?:kč|czk|€|eur|zł|pln)?\s*\)?$/i.exec(part);
      return m && m[1].trim() ? { name: m[1].trim(), amount: parseAmount(m[2]) } : { name: part, amount: null };
    });
}
