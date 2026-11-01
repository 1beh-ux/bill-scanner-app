// Vyúčtování (2026-11-01): one link per person per event -- /vyuctovani/<event>/<token>, no login -- showing what
// was counted (official bills, personal parts), the result, a QR and the confirmations. Amounts are always live
// (the same netting as Platby, src/lib/personal-bills.ts); settling uses the bills' and shares' own flags.
// Fio: payments into the receiving account (the Pokladník's own, with their token; or the event's Banka account)
// carrying the link's variable symbol and at least the amount owed settle automatically; never an underpayment.
import crypto from "crypto";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { effectiveAmountCzk } from "@/lib/bill-amount";
import { PAYOUT_PAYER_WHERE } from "@/lib/payout";
import { netSettlement } from "@/lib/personal-bills";
import { openShares } from "@/lib/personal-bills-server";
import { claimFioSlot } from "@/lib/bank/check";
import { fetchFioMovements, fioErrorCode, normalizeVs, type FioMovement } from "@/lib/bank/fio-client";
import { decryptBankToken } from "@/lib/bank/token-crypto";
import { nameKey } from "@/lib/kitchen/import-normalize";

const DAY = 24 * 3600 * 1000;
const pragueDate = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(d);

/** The link's address: the event's name in it for people to recognise it; only the token matters. */
export function linkPath(eventName: string, token: string) {
  const slug = nameKey(eventName).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "akce";
  return `/vyuctovani/${slug}/${token}`;
}

/** The person's link on the event (created on first use): an unguessable token, a unique 7-digit VS starting with 9. */
export async function ensureLink(eventId: string, authorId: string) {
  const existing = await prisma.settlementLink.findUnique({ where: { eventId_authorId: { eventId, authorId } } });
  if (existing) return existing;
  for (let i = 0; i < 20; i++) {
    const variableSymbol = `9${String(crypto.randomInt(0, 1_000_000)).padStart(6, "0")}`;
    try {
      return await prisma.settlementLink.create({ data: { eventId, authorId, token: crypto.randomBytes(18).toString("base64url"), variableSymbol } });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      // A VS clash (or a parallel create of the same person's link): try again / take that one.
      const raced = await prisma.settlementLink.findUnique({ where: { eventId_authorId: { eventId, authorId } } });
      if (raced) return raced;
    }
  }
  throw new Error("no_free_variable_symbol");
}

/** "Zrušit odkaz": a new token (and VS), the old link stops working; claims start over. */
export async function reissueLink(eventId: string, authorId: string) {
  await prisma.settlementLink.deleteMany({ where: { eventId, authorId } });
  return ensureLink(eventId, authorId);
}

type EventRow = { id: string; name: string; treasurerAuthorId: string | null; settlementReceiver: string; bankAccountId: string | null };
export type Receiver = { kind: "event" | "author"; id: string; name: string; bankAccountNumber: string | null; bankCode: string | null; autoConfirm: boolean };

/** Where people pay the event: the Pokladník's own account ("treasurer", the default) or the event's Banka account. */
export async function receiverOf(event: EventRow): Promise<Receiver | null> {
  if (event.settlementReceiver === "event" && event.bankAccountId) {
    const a = await prisma.bankAccount.findUnique({ where: { id: event.bankAccountId }, select: { id: true, label: true, accountNumber: true, bankCode: true, tokenEncrypted: true, active: true } });
    if (a) return { kind: "event", id: a.id, name: a.label, bankAccountNumber: a.accountNumber, bankCode: a.bankCode, autoConfirm: a.active && !!a.tokenEncrypted };
  }
  if (!event.treasurerAuthorId) return null;
  const t = await prisma.author.findUnique({ where: { id: event.treasurerAuthorId }, select: { id: true, canonicalName: true, bankAccountNumber: true, bankCode: true, fioTokenEncrypted: true } });
  return t && { kind: "author", id: t.id, name: t.canonicalName, bankAccountNumber: t.bankAccountNumber, bankCode: t.bankCode, autoConfirm: !!t.fioTokenEncrypted };
}

/** The event's netting (as Platby, scope "approved"): official payouts owed + open personal parts. */
export async function eventNetting(eventId: string) {
  const bills = await prisma.bill.findMany({
    where: { eventId, status: "approved", paidToAuthor: false, payerAuthorId: { not: null }, payerAuthor: PAYOUT_PAYER_WHERE },
    select: { payerAuthorId: true, amountCzk: true, totalAmount: true, currency: true },
  });
  const official = new Map<string, number>();
  for (const b of bills) {
    const a = effectiveAmountCzk(b);
    if (a !== null) official.set(b.payerAuthorId!, (official.get(b.payerAuthorId!) ?? 0) + Number(a));
  }
  const shares = await openShares(eventId);
  return { official, shares, net: netSettlement(official, shares) };
}

/**
 * "Zaplaceno" for one person (Platby, the bank, or their link): their approved official bills paid out, and the
 * personal parts through the event settled on both sides -- their own parts and the others' parts of bills they
 * paid. pay=false undoes it.
 */
export async function markPersonPaid(eventId: string, authorId: string, userId: string | null, pay = true, scope: "approved" | "all" = "approved") {
  const now = new Date();
  const [bills, own, theirs] = await prisma.$transaction([
    prisma.bill.updateMany({
      where: { eventId, payerAuthorId: authorId, payerAuthor: PAYOUT_PAYER_WHERE, ...(scope === "approved" ? { status: "approved" } : {}), paidToAuthor: !pay },
      data: pay ? { paidToAuthor: true, paidAt: now, paidByUserId: userId } : { paidToAuthor: false, paidAt: null, paidByUserId: null },
    }),
    prisma.personalBillShare.updateMany({
      where: { authorId, personalBill: { eventId, OR: [{ viaEvent: true }, { authorId: null }] }, settledAt: pay ? null : { not: null } },
      data: pay ? { settledAt: now, settledByUserId: userId } : { settledAt: null, settledByUserId: null },
    }),
    prisma.personalBillShare.updateMany({
      where: { authorId: { not: authorId }, personalBill: { eventId, viaEvent: true, authorId }, creditorPaidAt: pay ? null : { not: null } },
      data: { creditorPaidAt: pay ? now : null },
    }),
  ]);
  return { bills: bills.count, personal: own.count + theirs.count };
}

/** Person to person: every open share between the two (both directions, as netted) settled -- or opened again. */
export async function settlePair(eventId: string, debtorId: string, creditorId: string, userId: string | null, settle = true) {
  const r = await prisma.personalBillShare.updateMany({
    where: {
      personalBill: { eventId },
      settledAt: settle ? null : { not: null },
      OR: [
        { authorId: debtorId, personalBill: { authorId: creditorId, viaEvent: false } },
        { authorId: creditorId, personalBill: { authorId: debtorId, viaEvent: false } },
      ],
    },
    data: settle ? { settledAt: new Date(), settledByUserId: userId } : { settledAt: null, settledByUserId: null },
  });
  return r.count;
}

/** One Fio call per payer token per 30 s (and at most every `minMs`): claimed before the call. */
async function claimAuthorFio(authorId: string, minMs: number) {
  const secs = Math.max(35, Math.round(minMs / 1000));
  const r = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE authors SET fio_last_checked_at = now()
    WHERE id = ${authorId} AND fio_token_encrypted IS NOT NULL AND (fio_last_checked_at IS NULL OR fio_last_checked_at < now() - make_interval(secs => ${secs}))
    RETURNING id`;
  return r.length > 0;
}

/**
 * Check the event's links against the bank: the receiving account (payments to the event) and the accounts of
 * person-to-person creditors who gave their Fio token. A movement settles when it carries a link's VS and at
 * least what that link owes there; each movement is used once. minMs: how often at most (cron: 10 min).
 */
export async function checkSettlementPayments(eventId: string, minMs = 35_000): Promise<{ checked: number; settled: number }> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { id: true, name: true, treasurerAuthorId: true, settlementReceiver: true, bankAccountId: true } });
  const links = await prisma.settlementLink.findMany({ where: { eventId } });
  if (!links.length) return { checked: 0, settled: 0 };
  const byVs = new Map(links.map((l) => [l.variableSymbol, l]));
  const used = new Set(links.flatMap((l) => l.paidMovementIds));
  const { net } = await eventNetting(eventId);
  const owesEvent = new Map(net.rows.filter((r) => r.net < -0.004).map((r) => [r.authorId, -r.net]));
  const receiver = await receiverOf(event);
  const from = pragueDate(new Date(Math.max(Math.min(...links.map((l) => l.createdAt.getTime())) - DAY, Date.now() - 85 * DAY)));
  const to = pragueDate(new Date());
  let checked = 0;
  let settled = 0;

  const fetchFor = async (kind: "event" | "author", id: string): Promise<FioMovement[] | null> => {
    if (kind === "event") {
      const a = await prisma.bankAccount.findUnique({ where: { id }, select: { tokenEncrypted: true, lastCheckedAt: true } });
      if (!a?.tokenEncrypted || (a.lastCheckedAt && Date.now() - a.lastCheckedAt.getTime() < minMs) || !(await claimFioSlot(id))) return null;
      try {
        return await fetchFioMovements(decryptBankToken(a.tokenEncrypted), from, to);
      } catch (err) {
        await prisma.bankAccount.update({ where: { id }, data: { lastError: fioErrorCode(err) } });
        return null;
      }
    }
    const a = await prisma.author.findUnique({ where: { id }, select: { fioTokenEncrypted: true } });
    if (!a?.fioTokenEncrypted || !(await claimAuthorFio(id, minMs))) return null;
    try {
      const m = await fetchFioMovements(decryptBankToken(a.fioTokenEncrypted), from, to);
      await prisma.author.update({ where: { id }, data: { fioLastSuccessAt: new Date(), fioLastError: null } });
      return m;
    } catch (err) {
      await prisma.author.update({ where: { id }, data: { fioLastError: fioErrorCode(err) } });
      return null;
    }
  };
  const take = async (linkId: string, m: FioMovement) => {
    used.add(m.movementId);
    await prisma.settlementLink.update({ where: { id: linkId }, data: { paidMovementIds: { push: m.movementId } } });
  };

  // Payments to the event.
  if (receiver?.autoConfirm && owesEvent.size) {
    const movements = await fetchFor(receiver.kind, receiver.id);
    if (movements) {
      checked++;
      for (const m of movements) {
        const link = m.amount > 0 && !used.has(m.movementId) ? byVs.get(normalizeVs(m.variableSymbol) ?? "") : undefined;
        const owed = link ? owesEvent.get(link.authorId) : undefined;
        if (!link || owed == null || m.amount + 0.004 < owed) continue;
        await take(link.id, m);
        await markPersonPaid(eventId, link.authorId, null);
        owesEvent.delete(link.authorId);
        settled++;
        // Banka keeps the movement as settled (not "unmatched" in its review).
        if (receiver.kind === "event")
          await prisma.bankMovement.upsert({
            where: { bankAccountId_movementId: { bankAccountId: receiver.id, movementId: m.movementId } },
            create: { bankAccountId: receiver.id, movementId: m.movementId, bookedAt: m.bookedAt, amount: m.amount, currency: m.currency, variableSymbol: m.variableSymbol, counterName: m.counterName, counterAccount: m.counterAccount, message: m.message, status: "settled", reason: "settlement_link" },
            update: {},
          });
      }
    }
  }
  // Person to person, into creditors' own accounts (their Fio token).
  const byCreditor = new Map<string, { debtorId: string; amountCzk: number }[]>();
  for (const d of net.debts) byCreditor.set(d.creditorId, [...(byCreditor.get(d.creditorId) ?? []), d]);
  for (const [creditorId, debts] of byCreditor) {
    const movements = await fetchFor("author", creditorId);
    if (!movements) continue;
    checked++;
    for (const m of movements) {
      const link = m.amount > 0 && !used.has(m.movementId) ? byVs.get(normalizeVs(m.variableSymbol) ?? "") : undefined;
      const debt = link && debts.find((d) => d.debtorId === link.authorId);
      if (!link || !debt || m.amount + 0.004 < debt.amountCzk) continue;
      await take(link.id, m);
      await settlePair(eventId, link.authorId, creditorId, null);
      debts.splice(debts.indexOf(debt), 1);
      settled++;
    }
  }
  return { checked, settled };
}
