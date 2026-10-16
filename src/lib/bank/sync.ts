// Banka: "Synchronizovat" for a linked account (Fio API or Google Sheet) and the daily job step.
// Fio: one call per token per 30 s (claimFioSlot, shared with the payment check); periods/ only.
import type { BankAccount, EventBankAccount } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { claimFioSlot } from "@/lib/bank/check";
import { decryptBankToken } from "@/lib/bank/token-crypto";
import { fetchFioStatement, fioErrorCode, parseFioTransactions, type FioError, type FioInfo } from "@/lib/bank/fio-client";
import { commitImport, parseTable, readTable, ymd, type Window } from "@/lib/bank/import";
import { readSheetTable } from "@/lib/sheet-import";
import type { RowResult } from "@/lib/bank/parse";

export type SyncError = FioError | "no_token" | "not_fio" | "no_sheet" | "mapping_incomplete" | "sheet_error";
export type SyncResult = Awaited<ReturnType<typeof commitImport>> & { info?: FioInfo };

const pragueToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date());

/** The link's window, never past today (Fio refuses future dates). */
export function windowOf(link: Pick<EventBankAccount, "dateFrom" | "dateTo">): Window {
  const today = pragueToday();
  const to = ymd(link.dateTo) > today ? today : ymd(link.dateTo);
  return { from: ymd(link.dateFrom) > to ? to : ymd(link.dateFrom), to };
}

export async function syncFio(eventId: string, link: EventBankAccount & { bankAccount: BankAccount }, userId: string | null, window = windowOf(link)): Promise<{ error: SyncError } | SyncResult> {
  const account = link.bankAccount;
  if (account.sourceType !== "fio_api") return { error: "not_fio" };
  if (!account.tokenEncrypted) return { error: "no_token" };
  if (!(await claimFioSlot(account.id))) return { error: "throttled" };
  let json: unknown;
  try {
    json = await fetchFioStatement(decryptBankToken(account.tokenEncrypted), window.from, window.to);
  } catch (err) {
    const code = fioErrorCode(err);
    await prisma.bankAccount.update({ where: { id: account.id }, data: { lastError: code, lastSyncResult: { error: code } } });
    return { error: code };
  }
  let parsed: ReturnType<typeof parseFioTransactions>;
  try {
    parsed = parseFioTransactions(json);
  } catch {
    return { error: "bad_response" };
  }
  // Fio says the account's currency (a PLN / EUR account at Fio).
  if (parsed.info.currency && parsed.info.currency !== account.currency) {
    await prisma.bankAccount.update({ where: { id: account.id }, data: { currency: parsed.info.currency } });
    account.currency = parsed.info.currency;
  }
  const results: RowResult[] = parsed.txs.map((tx, i) => ({ line: i + 1, ok: true, tx }));
  const res = await commitImport({ eventId, account, source: "fio", userId, results, window, markMissing: true });
  await prisma.bankAccount.update({ where: { id: account.id }, data: { lastSuccessAt: new Date(), lastError: null, lastSyncResult: { ...res, info: parsed.info, window } } });
  return { ...res, info: parsed.info };
}

export async function syncSheet(eventId: string, link: EventBankAccount & { bankAccount: BankAccount }, userId: string | null): Promise<{ error: SyncError } | SyncResult> {
  const account = link.bankAccount;
  if (!account.sheetId) return { error: "no_sheet" };
  let table: Awaited<ReturnType<typeof readSheetTable>>;
  try {
    table = await readSheetTable(eventId, account.sheetId, account.sheetRange ?? undefined);
  } catch {
    return { error: "sheet_error" };
  }
  const t = readTable([table.headers, ...table.rows], account.columnMapping);
  if (!t.mapping.includes("date") || (!t.mapping.includes("amount") && !t.mapping.includes("debit") && !t.mapping.includes("credit"))) return { error: "mapping_incomplete" };
  return commitImport({ eventId, account, source: "sheet", userId, results: parseTable(t, account), window: windowOf(link), markMissing: true });
}

/**
 * Daily job (cron/exchange-rates): every Fio account linked to an active event syncs that event's
 * window, the last 85 days of it at most (older data needs Fio's manual history unlock). One token at
 * a time; a token still in its 30 s pause gets one retry after 36 s.
 */
export async function dailyBankSync(): Promise<string[]> {
  const links = await prisma.eventBankAccount.findMany({
    where: { event: { status: "active" }, bankAccount: { sourceType: "fio_api", active: true, tokenEncrypted: { not: null } } },
    include: { bankAccount: true },
    orderBy: { bankAccountId: "asc" },
  });
  const log: string[] = [];
  const recent = ymd(new Date(Date.now() - 85 * 864e5));
  for (const link of links) {
    const w = windowOf(link);
    const window = { from: w.from < recent ? recent : w.from, to: w.to };
    if (window.from > window.to) continue;
    let r = await syncFio(link.eventId, link, null, window);
    if ("error" in r && r.error === "throttled") {
      await new Promise((ok) => setTimeout(ok, 36_000));
      r = await syncFio(link.eventId, link, null, window);
    }
    log.push(`${link.eventId}/${link.bankAccountId}: ${"error" in r ? r.error : `new ${r.counts.new}, duplicate ${r.counts.duplicate}`}`);
  }
  return log;
}
