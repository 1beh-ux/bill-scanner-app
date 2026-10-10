// Fio read-only API (docs/bank-payments-design.md). The URL carries the token:
// it is never logged, thrown or returned -- errors are short codes only. Plain
// node:https rather than fetch, so Next's fetch instrumentation never sees the URL.
import https from "node:https";

export type FioError = "throttled" | "token_invalid" | "unreachable" | "bad_response";

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
export function fetchFioMovements(token: string, from: string, to: string): Promise<FioMovement[]> {
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
          if (status >= 500) return fail("unreachable");
          if (status !== 200) return fail("bad_response");
          try {
            resolve(parseFioStatement(JSON.parse(body)));
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

export const FIO_ERRORS: FioError[] = ["throttled", "token_invalid", "unreachable", "bad_response"];
/** A caught error -> its code (never the message of something unexpected, which could carry the URL). */
export const fioErrorCode = (err: unknown): FioError => {
  const m = err instanceof Error ? err.message : "";
  return (FIO_ERRORS as string[]).includes(m) ? (m as FioError) : "unreachable";
};
