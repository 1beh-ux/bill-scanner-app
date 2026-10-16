// Banka: automatic classification of a newly imported transaction (docs/bank-reconciliation.md,
// design section 5). Pure; the import applies it only to new rows, never over a user's choice.
import type { BankClassification, BankIncomeType } from "@/generated/prisma";
import { fold } from "@/lib/planning-import";
import type { ParsedTx } from "@/lib/bank/parse";

/** "000019-0002400222/2010" and "19-2400222/2010" are the same account. */
export function accountKey(account: string | null | undefined, bankCode: string | null | undefined): string | null {
  if (!account) return null;
  const m = /^(?:(\d+)-)?(\d+)$/.exec(account.replace(/\s/g, ""));
  if (!m) return null;
  const prefix = (m[1] ?? "").replace(/^0+/, "");
  const number = m[2].replace(/^0+/, "");
  return `${prefix ? prefix + "-" : ""}${number}/${(bankCode ?? "").trim()}`;
}

export type ClassifyCtx = { ownAccounts: Set<string>; participantVs: Set<string> };
export type Classified = { classification: BankClassification; incomeType: BankIncomeType | null; noDocumentNeeded: boolean };

const NO_DOC: BankClassification[] = ["cash", "transfer", "fee", "private", "other_event", "income"];
const done = (classification: BankClassification, incomeType: BankIncomeType | null = null): Classified => ({ classification, incomeType, noDocumentNeeded: NO_DOC.includes(classification) });

export function classify(tx: Pick<ParsedTx, "amount" | "counterpartyAccount" | "counterpartyBankCode" | "vs" | "message" | "note" | "bankType">, ctx: ClassifyCtx): Classified {
  const own = accountKey(tx.counterpartyAccount, tx.counterpartyBankCode);
  if (own && ctx.ownAccounts.has(own)) return done("transfer");
  const type = fold(tx.bankType ?? "");
  const text = fold([tx.message, tx.note].filter(Boolean).join(" "));
  const both = `${type} ${text}`;
  if (/vyber z bankomatu|vyber hotovosti/.test(both) || (/\bvyber\b/.test(both) && /kart/.test(type))) return done("cash");
  if (type.startsWith("poplatek") || text.startsWith("poplatek")) return done("fee");
  if (tx.amount > 0) return tx.vs && ctx.participantVs.has(tx.vs) ? done("income", "fee") : done("income", "other");
  return done("expense");
}
