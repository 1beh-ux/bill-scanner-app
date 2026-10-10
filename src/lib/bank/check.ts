// One check of a Fio account (docs/bank-payments-design.md Part 3): fetch the
// movements since the oldest unpaid registration, store the unseen ones, match
// them (src/lib/bank/bank-matching.ts) and settle = create the event's payment
// document (receivedVia "bank"). Logs one line, never the token or the URL.
import { prisma } from "@/lib/prisma";
import { withMembers } from "@/lib/children";
import { buildVariableSymbol, effectivePriceCzk } from "@/lib/document-variables";
import { countsAsReceived } from "@/lib/registration-status";
import { matchMovements, type Candidate } from "@/lib/bank/bank-matching";
import { fetchFioMovements, fioErrorCode, type FioError } from "@/lib/bank/fio-client";
import { decryptBankToken } from "@/lib/bank/token-crypto";

export type CheckReason = "cron" | "admin" | "event" | "portal" | "token";
export type CheckResult =
  | { status: "nothing_to_do" }
  | { status: "throttled" }
  | { status: "ok"; settled: number; review: number }
  | { status: "error"; code: FioError | "no_token" };

const DAY = 24 * 3600 * 1000;
const pragueDate = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(d);

type Registration = Candidate & { paymentDocTypeId: string; createdAt: Date };

/** Accepted, active participants of the events checking this account (paid ones too -- for "duplicate"). */
export async function bankCandidates(bankAccountId: string): Promise<Registration[]> {
  const events = await prisma.event.findMany({ where: { bankAccountId, bankCheckEnabled: true, paymentDocTypeId: { not: null } } });
  const out: Registration[] = [];
  for (const e of events) {
    const priced = await withMembers(e);
    const participants = await prisma.participant.findMany({
      where: { eventId: e.id, active: true, registrationStatus: "accepted" },
      include: { documents: { where: { eventListItemId: e.paymentDocTypeId! } } },
    });
    for (const p of participants) {
      const merge = { ...p, customFieldValues: p.customFieldValues as Record<string, string> | null, guardians: [] };
      const expected = p.acceptedPriceCzk ?? effectivePriceCzk(merge, priced);
      // ponytail: no price = nothing to compare against; its payments land in review as no_match.
      if (expected == null) continue;
      out.push({
        participantId: p.id,
        acceptedVs: p.acceptedVariableSymbol,
        currentVs: buildVariableSymbol(merge, priced) || null,
        expected,
        paid: p.documents.some(countsAsReceived),
        paymentDocTypeId: e.paymentDocTypeId!,
        createdAt: p.createdAt,
      });
    }
  }
  return out;
}

/** Create the payment document + settle the movement, unless the participant got paid meanwhile. */
export async function settleMovement(movementRowId: string, participantId: string, paymentDocTypeId: string, decidedByUserId: string | null): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const docs = await tx.participantDocument.findMany({ where: { participantId, eventListItemId: paymentDocTypeId } });
    if (docs.some(countsAsReceived)) {
      await tx.bankMovement.update({ where: { id: movementRowId }, data: { status: "review", reason: "duplicate", participantId, decidedByUserId } });
      return false;
    }
    const doc = await tx.participantDocument.create({ data: { participantId, eventListItemId: paymentDocTypeId, receivedVia: "bank", receivedByUserId: null } });
    await tx.bankMovement.update({ where: { id: movementRowId }, data: { status: "settled", reason: null, participantId, participantDocumentId: doc.id, decidedByUserId } });
    return true;
  });
}

export async function checkBankAccount(bankAccountId: string, { reason }: { reason: CheckReason }): Promise<CheckResult> {
  const result = await run(bankAccountId);
  console.log(`bank-check account=${bankAccountId} reason=${reason} ${Object.entries(result).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  return result;
}

async function run(bankAccountId: string): Promise<CheckResult> {
  const candidates = await bankCandidates(bankAccountId);
  const unpaid = candidates.filter((c) => !c.paid);
  if (!unpaid.length) return { status: "nothing_to_do" };

  // Fio allows one call per token per 30 s; this also keeps parallel callers (cron, portal polls) apart.
  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE bank_accounts SET last_checked_at = now()
    WHERE id = ${bankAccountId} AND active AND (last_checked_at IS NULL OR last_checked_at < now() - interval '35 seconds')
    RETURNING id`;
  if (!claimed.length) return { status: "throttled" };

  const fail = async (code: FioError | "no_token"): Promise<CheckResult> => {
    await prisma.bankAccount.update({ where: { id: bankAccountId }, data: { lastError: code } });
    return { status: "error", code };
  };
  const account = await prisma.bankAccount.findUniqueOrThrow({ where: { id: bankAccountId }, select: { tokenEncrypted: true } });
  if (!account.tokenEncrypted) return fail("no_token");

  const oldest = Math.min(...unpaid.map((c) => c.createdAt.getTime())) - DAY;
  const from = pragueDate(new Date(Math.max(oldest, Date.now() - 85 * DAY)));
  let movements;
  try {
    movements = await fetchFioMovements(decryptBankToken(account.tokenEncrypted), from, pragueDate(new Date()));
  } catch (err) {
    return fail(fioErrorCode(err));
  }

  const known = new Set(
    (await prisma.bankMovement.findMany({ where: { bankAccountId, movementId: { in: movements.map((m) => m.movementId) } }, select: { movementId: true } })).map((m) => m.movementId)
  );
  const fresh = movements.filter((m) => !known.has(m.movementId));
  const byId = new Map(fresh.map((m) => [m.movementId, m]));
  const docType = new Map(candidates.map((c) => [c.participantId, c.paymentDocTypeId]));
  let settled = 0;
  let review = 0;
  for (const d of matchMovements(fresh, candidates)) {
    const m = byId.get(d.movementId)!;
    const row = await prisma.bankMovement.create({
      data: {
        bankAccountId, movementId: m.movementId, bookedAt: m.bookedAt, amount: m.amount, currency: m.currency, variableSymbol: m.variableSymbol,
        counterName: m.counterName, counterAccount: m.counterAccount, message: m.message,
        status: "review", reason: d.reason ?? null, participantId: d.participantId,
      },
    });
    if (d.status === "settled" && (await settleMovement(row.id, d.participantId, docType.get(d.participantId)!, null))) settled++;
    else review++;
  }
  await prisma.bankAccount.update({ where: { id: bankAccountId }, data: { lastSuccessAt: new Date(), lastError: null } });
  return { status: "ok", settled, review };
}
