// Fio read-only API (docs/bank-payments-design.md). The URL carries the token:
// it is never logged, thrown or returned -- errors are short codes only. Plain
// node:https rather than fetch, so Next's fetch instrumentation never sees the URL.
import https from "node:https";
import { parseBankAmount, type ParsedTx } from "@/lib/bank/parse";

// history_locked: data older than 90 days without the history unlock in Fio internet banking (422).
export type FioError = "throttled" | "token_invalid" | "unreachable" | "bad_response" | "history_locked";

export type FioMovement = {
  movementId: string;
  bookedAt: Date;
  amount: number;
  currency: string;
  variableSymbol: string | null;
  counterName: string | null;
  counterAccount: string | null;
  message: string | null;
};

type Column = { value: unknown } | null | undefined;
type Tx = Record<string, Column>;

const str = (c: Column) => (c?.value == null || c.value === "" ? null : String(c.value).trim());

/** VS as matched everywhere: digits only, no leading zeros; null when nothing is left. */
export const normalizeVs = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "").replace(/^0+/, "") || null;

// column0 is "2026-10-01+0200" (or a timestamp): the date part, as UTC midnight.
function parseDate(c: Column): Date | null {
  if (typeof c?.value === "number") return new Date(new Date(c.value).toISOString().slice(0, 10));
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(str(c) ?? "");
  return m ? new Date(m[1]) : null;
}

/** Fio's JSON -> movements. Throws "bad_response" when it isn't a statement. */
export function parseFioStatement(json: unknown): FioMovement[] {
  const statement = (json as { accountStatement?: { transactionList?: { transaction?: Tx[] | null } | null } } | null)?.accountStatement;
  if (!statement || typeof statement !== "object") throw new Error("bad_response");
  const list = statement.transactionList?.transaction ?? [];
  if (!Array.isArray(list)) throw new Error("bad_response");
  return list.flatMap((t) => {
    const movementId = str(t.column22);
    const amount = Number(t.column1?.value);
    const bookedAt = parseDate(t.column0);
    if (!movementId || !Number.isFinite(amount) || !bookedAt) return [];
    const account = str(t.column2);
    const bank = str(t.column3);
    return [{
      movementId,
      bookedAt,
      amount,
      currency: (str(t.column14) ?? "CZK").toUpperCase(),
      variableSymbol: normalizeVs(str(t.column5)),
      counterName: str(t.column10),
      counterAccount: account ? (bank ? `${account}/${bank}` : account) : null,
      message: str(t.column16),
    }];
  });
}

/** Movements booked from..to (yyyy-mm-dd, inclusive). Rejects with a FioError code as the message. */
export async function fetchFioMovements(token: string, from: string, to: string): Promise<FioMovement[]> {
  const json = await fetchFioStatement(token, from, to);
  try {
    return parseFioStatement(json);
  } catch {
    throw new Error("bad_response");
  }
}

/** The raw statement JSON (periods/, never last/ -- its server-side bookmark would be shared). */
export function fetchFioStatement(token: string, from: string, to: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const fail = (code: FioError) => reject(new Error(code));
    const req = https.get(
      { host: "fioapi.fio.cz", path: `/v1/rest/periods/${encodeURIComponent(token)}/${from}/${to}/transactions.json`, timeout: 20_000 },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("error", () => fail("unreachable"));
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          if (status === 409) return fail("throttled");
          if (status === 401 || status === 403) return fail("token_invalid");
          if ((status === 500 || status === 422) && /token/i.test(body)) return fail("token_invalid");
          if (status === 422) return fail("history_locked");
          if (status >= 500) return fail("unreachable");
          if (status !== 200) return fail("bad_response");
          try {
            resolve(JSON.parse(body));
          } catch {
            fail("bad_response");
          }
        });
      }
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => fail("unreachable"));
  });
}

export const FIO_ERRORS: FioError[] = ["throttled", "token_invalid", "unreachable", "bad_response", "history_locked"];
/** A caught error -> its code (never the message of something unexpected, which could carry the URL). */
export const fioErrorCode = (err: unknown): FioError => {
  const m = err instanceof Error ? err.message : "";
  return (FIO_ERRORS as string[]).includes(m) ? (m as FioError) : "unreachable";
};

/**
 * Banka: the whole statement -> transactions in the shared import shape (src/lib/bank/parse.ts) +
 * the account info. Column ids per Fio's API documentation (TransactionList): 22 ID pohybu, 0 Datum,
 * 1 Objem, 14 Měna, 2 Protiúčet, 3 Kód banky, 10 Název protiúčtu, 4 KS, 5 VS, 6 SS,
 * 7 Uživatelská identifikace, 16 Zpráva pro příjemce, 8 Typ, 9 Provedl, 18 Upřesnění, 25 Komentář.
 */
export function parseFioTransactions(json: unknown): { txs: ParsedTx[]; info: FioInfo } {
  const statement = (json as { accountStatement?: { info?: Record<string, unknown>; transactionList?: { transaction?: Tx[] | null } | null } } | null)?.accountStatement;
  if (!statement || typeof statement !== "object") throw new Error("bad_response");
  const list = statement.transactionList?.transaction ?? [];
  if (!Array.isArray(list)) throw new Error("bad_response");
  const i = statement.info ?? {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const info: FioInfo = {
    accountId: typeof i.accountId === "string" ? i.accountId : null,
    bankId: typeof i.bankId === "string" ? i.bankId : null,
    iban: typeof i.iban === "string" ? i.iban : null,
    currency: typeof i.currency === "string" ? i.currency : null,
    openingBalance: num(i.openingBalance),
    closingBalance: num(i.closingBalance),
  };
  const txs = list.flatMap((t): ParsedTx[] => {
    const id = str(t.column22);
    const amount = Number(t.column1?.value);
    const date = parseDate(t.column0);
    if (!id || !Number.isFinite(amount) || !date) return [];
    // Upřesnění carries the original amount of a card payment abroad: "15.90 EUR".
    const spec = str(t.column18);
    const orig = spec ? /^(-?[\d\s.,]+)\s+([A-Z]{3})$/.exec(spec) : null;
    const origAmount = orig ? parseBankAmount(orig[1]) : null;
    const note = [str(t.column7), str(t.column25), str(t.column9)].filter(Boolean).join(" · ") || null;
    return [{
      externalId: `fio:${id}`,
      bookingDate: date.toISOString().slice(0, 10),
      valueDate: null,
      amount: Math.round(amount * 100) / 100,
      currency: (str(t.column14) ?? "CZK").toUpperCase(),
      originalAmount: origAmount === null ? null : Math.abs(origAmount),
      originalCurrency: orig ? orig[2] : null,
      counterpartyAccount: str(t.column2),
      counterpartyBankCode: str(t.column3),
      counterpartyName: str(t.column10),
      vs: normalizeVs(str(t.column5)),
      ks: normalizeVs(str(t.column4)),
      ss: normalizeVs(str(t.column6)),
      message: str(t.column16),
      note: spec && !orig ? [note, spec].filter(Boolean).join(" · ") : note,
      bankType: str(t.column8),
    }];
  });
  return { txs, info };
}

export type FioInfo = { accountId: string | null; bankId: string | null; iban: string | null; currency: string | null; openingBalance: number | null; closingBalance: number | null };
