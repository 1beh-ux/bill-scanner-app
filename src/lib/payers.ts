import type { Prisma, AuthorBankAuditSource } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { czechAccountToIban } from "@/lib/qr-platba";

// Payers ("Plátci") are the `Author` rows -- one global record per person,
// linked to events through AuthorEventAccess. Shared rules for the event-scoped
// endpoints (src/app/api/events/[id]/payers) and the admin-only global ones
// (src/app/api/authors).

export type BankPair = { account: string | null; code: string | null };

/** Trim; empty string -> null. */
function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export function cleanBank(account: unknown, code: unknown): BankPair {
  return { account: clean(account)?.replace(/\s/g, "") ?? null, code: clean(code)?.replace(/\s/g, "") ?? null };
}

export type BankError = "bank_incomplete" | "invalid_bank_account";

/**
 * Both empty is fine (a payer without bank details). One without the other,
 * or a pair that isn't a valid Czech account number + 4-digit bank code, is
 * rejected. Reuses czechAccountToIban's parsing/validation.
 */
export function validateBank(bank: BankPair): BankError | null {
  if (bank.account === null && bank.code === null) return null;
  if (bank.account === null || bank.code === null) return "bank_incomplete";
  return czechAccountToIban(bank.account, bank.code) ? null : "invalid_bank_account";
}

/** Lower-case, diacritics stripped, whitespace collapsed -- for "is this the same person" checks. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokenKey(s: string): string {
  return normalizeName(s).split(" ").sort().join(" ");
}

/**
 * Active payers whose name looks like `name`: equal after normalization,
 * same words in another order ("Novák Jan" / "Jan Novák"), or one contains the
 * other. Names only -- callers must not reveal bank details from this.
 */
export async function findSimilarAuthors(name: string): Promise<{ id: string; canonicalName: string }[]> {
  const n = normalizeName(name);
  if (!n) return [];
  const key = tokenKey(name);
  const all = await prisma.author.findMany({ where: { active: true }, select: { id: true, canonicalName: true } });
  return all.filter((a) => {
    const an = normalizeName(a.canonicalName);
    if (an === n || tokenKey(a.canonicalName) === key) return true;
    return n.length >= 4 && an.length >= 4 && (an.includes(n) || n.includes(an));
  });
}

/**
 * Sets a payer's bank details and, if they actually changed, writes an
 * AuthorBankAudit row in the same transaction. Returns whether anything changed.
 */
export async function setAuthorBank(
  tx: Prisma.TransactionClient,
  opts: { authorId: string; bank: BankPair; userId: string; eventId: string | null; source: AuthorBankAuditSource }
): Promise<boolean> {
  const current = await tx.author.findUniqueOrThrow({
    where: { id: opts.authorId },
    select: { bankAccountNumber: true, bankCode: true },
  });
  if (current.bankAccountNumber === opts.bank.account && current.bankCode === opts.bank.code) return false;

  await tx.author.update({
    where: { id: opts.authorId },
    data: { bankAccountNumber: opts.bank.account, bankCode: opts.bank.code },
  });
  await tx.authorBankAudit.create({
    data: {
      authorId: opts.authorId,
      changedByUserId: opts.userId,
      eventId: opts.eventId,
      oldBankAccountNumber: current.bankAccountNumber,
      oldBankCode: current.bankCode,
      newBankAccountNumber: opts.bank.account,
      newBankCode: opts.bank.code,
      source: opts.source,
    },
  });
  return true;
}

/** The payer if it is attached to this event and still usable (active, not merged away); else null. */
export async function getAttachedPayer(eventId: string, payerId: string) {
  const access = await prisma.authorEventAccess.findUnique({
    where: { authorId_eventId: { authorId: payerId, eventId } },
    include: { author: true },
  });
  if (!access || !access.author.active || access.author.mergedIntoAuthorId) return null;
  return access.author;
}

export const RECENT_BANK_CHANGE_DAYS = 30;
