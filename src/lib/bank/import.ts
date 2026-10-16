// Banka: one import path for every source (docs/bank-reconciliation.md A3). Source -> parsed rows
// (src/lib/bank/parse.ts) -> preview (Nové / Duplicita / Mimo období / Chyba) or commit: new rows
// inserted with the automatic classification (src/lib/bank/classify.ts), existing rows never touched
// (a Sheet row that disappeared only gets sourceMissing), a BankImportBatch with the per-row result,
// then suggestions. The confirm call re-sends the source and parses again: nothing from a preview is
// trusted.
import { Prisma, type BankAccount, type BankImportSource } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { accountKey, classify } from "@/lib/bank/classify";
import { cleanMapping, findHeaderRow, guessBankMapping, mappingProblems, rowsToTransactions, toRows, type ParsedTx, type RowResult } from "@/lib/bank/parse";
import { runSuggestions } from "@/lib/bank/suggest";

export type Window = { from: string; to: string }; // YYYY-MM-DD, inclusive
export type RowStatus = "new" | "duplicate" | "outside" | "error";
export type ResultRow = { line: number; status: RowStatus; reason?: string; date?: string; amount?: number; counterparty?: string | null; message?: string | null; raw?: string };
export type Counts = Record<RowStatus, number>;

export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const idPrefixFor = (account: Pick<BankAccount, "bankCode">) => (account.bankCode === "2010" ? "fio:" : "id:");

/** A table (file / paste / Sheet) -> header row, headers, mapping (saved one if it fits, else guessed), data rows. */
export function readTable(rows: string[][], savedMapping: unknown, explicitHeaderRow?: number) {
  const headerRow = typeof explicitHeaderRow === "number" && explicitHeaderRow >= 0 && explicitHeaderRow < rows.length ? explicitHeaderRow : Math.max(0, findHeaderRow(rows));
  const headers = rows[headerRow] ?? [];
  const saved = cleanMapping(savedMapping, headers.length);
  const mapping = mappingProblems(saved).length === 0 ? saved : guessBankMapping(headers);
  return { headerRow, headers, mapping, data: rows.slice(headerRow + 1) };
}

export const tableFromText = (text: string) => toRows(text);

/** Row results -> statuses against the window and what the account already has. */
export async function evaluate(bankAccountId: string, results: RowResult[], window: Window) {
  const ids = results.flatMap((r) => (r.ok ? [r.tx.externalId] : []));
  const existing = new Set(
    (await prisma.bankTransaction.findMany({ where: { bankAccountId, externalId: { in: ids } }, select: { externalId: true } })).map((t) => t.externalId)
  );
  const counts: Counts = { new: 0, duplicate: 0, outside: 0, error: 0 };
  const fresh: ParsedTx[] = [];
  const rows: ResultRow[] = results.map((r) => {
    if (!r.ok) {
      counts.error++;
      return { line: r.line, status: "error", reason: r.reason, raw: r.raw };
    }
    const base = { line: r.line, date: r.tx.bookingDate, amount: r.tx.amount, counterparty: r.tx.counterpartyName ?? r.tx.counterpartyAccount, message: r.tx.message };
    if (r.tx.bookingDate < window.from || r.tx.bookingDate > window.to) {
      counts.outside++;
      return { ...base, status: "outside" };
    }
    if (existing.has(r.tx.externalId) || fresh.some((f) => f.externalId === r.tx.externalId)) {
      counts.duplicate++;
      return { ...base, status: "duplicate" };
    }
    counts.new++;
    fresh.push(r.tx);
    return { ...base, status: "new" };
  });
  return { counts, rows, fresh, presentIds: new Set(ids) };
}

/** Insert the new rows (classified), store the batch, mark Sheet rows that vanished, run suggestions. */
export async function commitImport(o: {
  eventId: string;
  account: BankAccount;
  source: BankImportSource;
  fileName?: string | null;
  userId: string | null;
  results: RowResult[];
  window: Window;
  // Sheet / Fio sync: rows of this account + event (inside the window) not present any more.
  markMissing?: boolean;
}) {
  const ev = await evaluate(o.account.id, o.results, o.window);
  const event = await prisma.event.findUniqueOrThrow({ where: { id: o.eventId }, select: { organizationId: true } });
  const [own, participants] = await Promise.all([
    prisma.bankAccount.findMany({ where: { organizationId: event.organizationId }, select: { accountNumber: true, bankCode: true } }),
    prisma.participant.findMany({ where: { eventId: o.eventId, acceptedVariableSymbol: { not: null } }, select: { acceptedVariableSymbol: true } }),
  ]);
  const ctx = {
    ownAccounts: new Set(own.map((a) => accountKey(a.accountNumber, a.bankCode)).filter((x): x is string => !!x)),
    participantVs: new Set(participants.map((p) => (p.acceptedVariableSymbol ?? "").replace(/\D/g, "").replace(/^0+/, "")).filter(Boolean)),
  };
  const dec = (n: number | null) => (n === null ? null : new Prisma.Decimal(n.toFixed(2)));
  const batch = await prisma.$transaction(async (tx) => {
    const b = await tx.bankImportBatch.create({
      data: { bankAccountId: o.account.id, eventId: o.eventId, source: o.source, fileName: o.fileName ?? null, counts: ev.counts, rows: ev.rows, userId: o.userId },
    });
    await tx.bankTransaction.createMany({
      data: ev.fresh.map((t) => ({
        bankAccountId: o.account.id,
        eventId: o.eventId,
        externalId: t.externalId,
        bookingDate: new Date(t.bookingDate),
        valueDate: t.valueDate ? new Date(t.valueDate) : null,
        amount: new Prisma.Decimal(t.amount.toFixed(2)),
        currency: t.currency,
        originalAmount: dec(t.originalAmount),
        originalCurrency: t.originalCurrency,
        counterpartyAccount: t.counterpartyAccount,
        counterpartyBankCode: t.counterpartyBankCode,
        counterpartyName: t.counterpartyName,
        vs: t.vs,
        ks: t.ks,
        ss: t.ss,
        message: t.message,
        note: t.note,
        bankType: t.bankType,
        ...classify(t, ctx),
        importBatchId: b.id,
      })),
      skipDuplicates: true,
    });
    if (o.markMissing) {
      const inWindow = { bankAccountId: o.account.id, eventId: o.eventId, bookingDate: { gte: new Date(o.window.from), lte: new Date(o.window.to) } };
      await tx.bankTransaction.updateMany({ where: { ...inWindow, externalId: { notIn: [...ev.presentIds] }, sourceMissing: false }, data: { sourceMissing: true } });
      await tx.bankTransaction.updateMany({ where: { ...inWindow, externalId: { in: [...ev.presentIds] }, sourceMissing: true }, data: { sourceMissing: false } });
    }
    return b;
  });
  const result = { counts: ev.counts, batchId: batch.id };
  await prisma.bankAccount.update({ where: { id: o.account.id }, data: { lastSyncAt: new Date(), lastSyncResult: result } });
  const suggestions = ev.counts.new > 0 ? await runSuggestions(o.eventId) : null;
  return { ...result, suggestions };
}

/** Parse a table with a mapping (the parsed RowResults for evaluate / commit). */
export function parseTable(t: ReturnType<typeof readTable>, account: BankAccount): RowResult[] {
  return rowsToTransactions(t.data, t.mapping, { firstLine: t.headerRow + 2, currency: account.currency, idPrefix: idPrefixFor(account) });
}
