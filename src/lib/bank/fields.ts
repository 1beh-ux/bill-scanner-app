// Banka import columns (client-safe: the import screen's mapping uses it; src/lib/bank/parse.ts reads with it).
import type { ImportField } from "@/lib/planning-import";

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
