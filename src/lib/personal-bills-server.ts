// Osobní účtenky, server side (src/lib/personal-bills.ts): the guard, the people one can pick, and the bill input.
// A person is always a payer (Author): an adult of the event without one gets a payer linked to Lidé.
import { NextResponse } from "next/server";
import { Prisma, type Currency } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { convertToCzk } from "@/lib/exchange-rates";
import { evenSplit, fromHal, tallyAmount, toHal, linesFor } from "@/lib/personal-bills";

type GuardEvent = { id: string; name: string; organizationId: string; status: string; treasurerAuthorId: string | null };
/** The Účtenky grant on the event (404 outside the acting organization). */
export async function personalGuard(eventId: string): Promise<{ error: NextResponse } | { user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; event: GuardEvent }> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return { error: denied };
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { id: true, name: true, organizationId: true, status: true, treasurerAuthorId: true } });
  return { user, event };
}

/** Payers of the event + its adults (Dospělí na akci); an adult already linked to a payer shows as that payer. */
export async function pickablePeople(eventId: string) {
  const [payers, adults] = await Promise.all([
    prisma.authorEventAccess.findMany({ where: { eventId, author: { active: true, mergedIntoAuthorId: null } }, select: { author: { select: { id: true, canonicalName: true, childId: true, bankAccountNumber: true } } } }),
    prisma.eventPerson.findMany({ where: { eventId }, select: { child: { select: { id: true, name: true, authors: { where: { active: true, mergedIntoAuthorId: null }, select: { id: true } } } } } }),
  ]);
  const people: { key: string; name: string; authorId: string | null; childId: string | null; hasBank: boolean }[] = payers.map((p) => ({ key: `a:${p.author.id}`, name: p.author.canonicalName, authorId: p.author.id, childId: p.author.childId, hasBank: !!p.author.bankAccountNumber }));
  for (const a of adults) {
    const linked = a.child.authors[0]?.id;
    if (linked && people.some((p) => p.authorId === linked)) continue;
    if (people.some((p) => p.childId === a.child.id)) continue;
    people.push({ key: linked ? `a:${linked}` : `c:${a.child.id}`, name: a.child.name, authorId: linked ?? null, childId: a.child.id, hasBank: false });
  }
  return people.sort((a, b) => a.name.localeCompare(b.name, "cs"));
}

/** A picked person ("a:<authorId>" / "c:<childId>") -> a payer of this organization, attached to the event. */
export async function resolvePerson(tx: Prisma.TransactionClient, eventId: string, organizationId: string, key: unknown): Promise<string | null> {
  if (typeof key !== "string") return null;
  const [kind, id] = [key.slice(0, 2), key.slice(2)];
  let authorId: string | null = null;
  if (kind === "a:") authorId = (await tx.author.findFirst({ where: { id, organizationId, active: true }, select: { id: true } }))?.id ?? null;
  else if (kind === "c:") {
    const child = await tx.child.findFirst({ where: { id, organizationId, isAdult: true }, select: { id: true, name: true } });
    if (!child) return null;
    authorId =
      (await tx.author.findFirst({ where: { childId: child.id, organizationId, active: true, mergedIntoAuthorId: null }, select: { id: true } }))?.id ??
      (await tx.author.create({ data: { canonicalName: child.name, organizationId, childId: child.id }, select: { id: true } })).id;
  }
  if (!authorId) return null;
  await tx.authorEventAccess.createMany({ data: [{ authorId, eventId }], skipDuplicates: true });
  return authorId;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const CURRENCIES: Currency[] = ["CZK", "EUR", "PLN"];

/**
 * Create / replace a personal bill from the form: { billDate, merchantName, totalAmount, currency, author (person
 * key, "event" = paid from the event's money), viaEvent, splitMode even|custom, shares: [{ person, amountCzk? }],
 * note, gcsObjectPath?, originalFilename?, lineItems? }.
 * Even = the CZK amount split to the haléř; custom = the given amounts (may not exceed the total; less = "nerozděleno").
 * Tally (unitPrice set, "čárky"): shares [{ person, quantity }], each = quantity × unitPrice, the total = their sum.
 */
export async function savePersonalBill(event: GuardEvent, userId: string, billId: string | null, b: Record<string, unknown>): Promise<{ id: string } | { error: string }> {
  const unitPrice = b.unitPrice == null || b.unitPrice === "" ? null : Number(String(b.unitPrice).replace(",", "."));
  if (unitPrice != null && !(unitPrice > 0 && unitPrice < 100000)) return { error: "bad_amount" };
  const rawTally = (Array.isArray(b.shares) ? b.shares : []) as { quantity?: unknown }[];
  const quantities = unitPrice != null ? rawTally.map((x) => Number(String(x.quantity ?? "").replace(",", "."))) : [];
  if (quantities.some((q) => !(q >= 0 && q < 100000))) return { error: "bad_amount" };
  const total = unitPrice != null ? quantities.reduce((sum, q) => sum + tallyAmount(q, unitPrice), 0) : Number(String(b.totalAmount ?? "").replace(",", "."));
  const currency = unitPrice != null ? "CZK" : CURRENCIES.includes(b.currency as Currency) ? (b.currency as Currency) : "CZK";
  const billDate = typeof b.billDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.billDate) ? new Date(`${b.billDate}T00:00:00Z`) : null;
  if (!(total > 0 && total < 10_000_000) || !billDate) return { error: "bad_request" };
  const conv = await convertToCzk(total, currency, billDate);
  const amountCzk = conv ? Number(conv.amountCzk.toFixed(2)) : null;
  const rawShares = (Array.isArray(b.shares) ? b.shares : []) as { person?: unknown; amountCzk?: unknown }[];
  const splitMode = b.splitMode === "custom" ? "custom" : "even";
  if (rawShares.length > 500) return { error: "bad_request" };

  return prisma.$transaction(async (tx) => {
    // "event" = paid from the event's money: the people pay the event, nobody is paid back.
    const authorId = b.author === "event" ? null : await resolvePerson(tx, event.id, event.organizationId, b.author);
    if (!authorId && b.author !== "event") return { error: "author_required" };
    const people: string[] = [];
    for (const s of rawShares) {
      const id = await resolvePerson(tx, event.id, event.organizationId, s.person);
      if (!id) return { error: "not_found" };
      if (people.includes(id)) return { error: "duplicate_person" };
      people.push(id);
    }
    let amounts: number[] = [];
    if (unitPrice != null) amounts = quantities.map((q) => tallyAmount(q, unitPrice));
    else if (people.length) {
      if (amountCzk == null) return { error: "no_rate" };
      if (splitMode === "even") amounts = evenSplit(amountCzk, people.length);
      else {
        amounts = rawShares.map((s) => Number(String(s.amountCzk ?? "").replace(",", ".")));
        if (amounts.some((a) => !(a >= 0))) return { error: "bad_amount" };
        if (amounts.reduce((s, a) => s + toHal(a), 0) > toHal(amountCzk)) return { error: "over_total" };
      }
    }
    const data = {
      authorId,
      billDate,
      merchantName: text(b.merchantName, 200) || null,
      totalAmount: total,
      currency,
      amountCzk,
      exchangeRateUsed: conv ? conv.rateUsed : null,
      splitMode: splitMode as "even" | "custom",
      viaEvent: !authorId || b.viaEvent !== false,
      unitPrice,
      unitLabel: unitPrice != null ? text(b.unitLabel, 60) || null : null,
      note: text(b.note, 2000) || null,
    } as const;
    let id = billId;
    // Paid parts are history (2026-11-02): they stay exactly as they are; the form's amounts are each person's total,
    // so what's above their paid part becomes a new open part. Less than what someone already paid is refused,
    // and so is changing who is paid back (the author / through the event) once anyone paid.
    const paid = new Map<string, { amount: number; qty: number }>();
    if (id) {
      const before = await tx.personalBill.findUniqueOrThrow({ where: { id }, select: { authorId: true, viaEvent: true, shares: { where: { OR: [{ settledAt: { not: null } }, { creditorPaidAt: { not: null } }] }, select: { authorId: true, amountCzk: true, quantity: true } } } });
      for (const sh of before.shares) {
        const p = paid.get(sh.authorId) ?? { amount: 0, qty: 0 };
        paid.set(sh.authorId, { amount: p.amount + Number(sh.amountCzk), qty: p.qty + Number(sh.quantity ?? 0) });
      }
      if (paid.size && (before.authorId !== authorId || before.viaEvent !== data.viaEvent)) return { error: "settled_author_locked" };
      for (const [person, p] of paid) {
        const i = people.indexOf(person);
        const want = i < 0 ? 0 : amounts[i] ?? 0;
        if (toHal(want) < toHal(p.amount)) return { error: "below_paid" };
      }
      await tx.personalBill.update({ where: { id }, data });
      await tx.personalBillShare.deleteMany({ where: { personalBillId: id, settledAt: null, creditorPaidAt: null } });
    } else {
      const file = typeof b.gcsObjectPath === "string" && b.gcsObjectPath.startsWith(`events/${event.id}/personal/`) ? b.gcsObjectPath : null;
      id = (await tx.personalBill.create({ data: { ...data, eventId: event.id, createdByUserId: userId, gcsObjectPath: file, originalFilename: file ? text(b.originalFilename, 200) || null : null }, select: { id: true } })).id;
    }
    // The receipt's lines (the AI's, or typed) with who each one is for ("podle položek"); the people are stored
    // as payers ("a:<id>"), so an adult picked before having a payer is still found when the bill is edited.
    if (Array.isArray(b.lineItems)) {
      const lineItems = [];
      for (const l of (b.lineItems as { description?: unknown; total?: unknown; assign?: unknown }[]).slice(0, 300)) {
        const assign: string[] = [];
        for (const k of Array.isArray(l?.assign) ? l.assign.slice(0, 200) : []) {
          const a = await resolvePerson(tx, event.id, event.organizationId, k);
          if (a && !assign.includes(`a:${a}`)) assign.push(`a:${a}`);
        }
        const total = Number(String(l?.total ?? "").replace(",", "."));
        lineItems.push({ description: text(l?.description, 200), total: Number.isFinite(total) && String(l?.total ?? "") !== "" ? total : null, assign });
      }
      await tx.personalBill.update({ where: { id: id! }, data: { lineItems } });
    }
    // A tally keeps only who had something.
    const rows = people
      .map((p, i) => ({
        personalBillId: id!,
        authorId: p,
        amountCzk: fromHal(toHal(amounts[i]) - toHal(paid.get(p)?.amount ?? 0)),
        quantity: unitPrice != null ? Math.round((quantities[i] - (paid.get(p)?.qty ?? 0)) * 100) / 100 : null,
      }))
      // Only what's left to pay (a tally: only who had something more).
      .filter((r) => r.amountCzk > 0 && (unitPrice == null || (r.quantity ?? 0) > 0));
    if (rows.length) await tx.personalBillShare.createMany({ data: rows });
    return { id: id! };
  });
}

/** Shares of the event still open on either side (for Platby). */
/** Assignment keys per payer: "a:<id>" plus the ids of payers merged into them (receipt lines keep old ids). */
export async function assignKeys(authorIds: string[]): Promise<(id: string) => string[]> {
  const merged = await prisma.author.findMany({ where: { mergedIntoAuthorId: { in: authorIds } }, select: { id: true, mergedIntoAuthorId: true } });
  return (id) => [`a:${id}`, ...merged.filter((m) => m.mergedIntoAuthorId === id).map((m) => `a:${m.id}`)];
}

export async function openShares(eventId: string) {
  const rows = await prisma.personalBillShare.findMany({
    where: { personalBill: { eventId }, OR: [{ settledAt: null }, { creditorPaidAt: null }] },
    select: { authorId: true, amountCzk: true, quantity: true, settledAt: true, creditorPaidAt: true, author: { select: { canonicalName: true } }, personalBill: { select: { authorId: true, viaEvent: true, merchantName: true, unitLabel: true, unitPrice: true, billDate: true, lineItems: true, splitMode: true, amountCzk: true, _count: { select: { shares: true } } } } },
  });
  const keysOf = await assignKeys([...new Set(rows.map((r) => r.authorId))]);
  return rows.map((r) => ({
    // What exactly (Platby): the person's receipt lines, else "n × unit price", else the even split.
    lines: linesFor(r.personalBill.lineItems, keysOf(r.authorId)),
    quantity: r.quantity == null ? null : Number(r.quantity),
    unitPrice: r.personalBill.unitPrice == null ? null : Number(r.personalBill.unitPrice),
    evenOf: r.personalBill.splitMode === "even" ? r.personalBill._count.shares : null,
    billTotal: r.personalBill.amountCzk == null ? null : Number(r.personalBill.amountCzk),
    debtorId: r.authorId,
    debtorName: r.author.canonicalName,
    creditorId: r.personalBill.authorId,
    viaEvent: r.personalBill.viaEvent,
    debtorOpen: !r.settledAt,
    creditorOpen: !r.creditorPaidAt,
    amountCzk: Number(r.amountCzk),
    merchantName: [r.personalBill.merchantName, r.quantity != null ? `${Number(r.quantity)}× ${r.personalBill.unitLabel ?? ""}`.trim() : null].filter(Boolean).join(" · ") || null,
    billDate: r.personalBill.billDate,
  }));
}

/**
 * "Zrušit platbu" (2026-11-03): a person's paid parts of a personal bill become open again (a mistaken or test
 * payment, a payment confirmed by mistake), merged with their open part; the cancellation is kept with its
 * mandatory reason (PaymentCorrection, Historie plateb). The bank movement stays "used", so it never settles again.
 */
export async function cancelPaidParts(eventId: string, billId: string, authorId: string, userId: string, note: string) {
  return prisma.$transaction(async (tx) => {
    const bill = await tx.personalBill.findFirst({ where: { id: billId, eventId }, select: { id: true, merchantName: true, unitLabel: true } });
    if (!bill) return { error: "not_found" as const };
    const paid = await tx.personalBillShare.findMany({ where: { personalBillId: billId, authorId, settledAt: { not: null } } });
    if (!paid.length) return { error: "nothing_paid" as const };
    await tx.personalBillShare.updateMany({ where: { id: { in: paid.map((p) => p.id) } }, data: { settledAt: null, settledByUserId: null } });
    // One open part again (only parts not paid back to the author: those stay as they are).
    const open = await tx.personalBillShare.findMany({ where: { personalBillId: billId, authorId, settledAt: null, creditorPaidAt: null }, orderBy: { id: "asc" } });
    if (open.length > 1) {
      const [keep, ...rest] = open;
      await tx.personalBillShare.update({
        where: { id: keep.id },
        data: {
          amountCzk: rest.reduce((s, r) => s.plus(r.amountCzk), keep.amountCzk),
          ...(keep.quantity && { quantity: rest.reduce((s, r) => s.plus(r.quantity ?? 0), keep.quantity) }),
        },
      });
      await tx.personalBillShare.deleteMany({ where: { id: { in: rest.map((r) => r.id) } } });
    }
    const amount = paid.reduce((s, p) => s + Number(p.amountCzk), 0);
    const qty = paid.reduce((s, p) => s + Number(p.quantity ?? 0), 0);
    await tx.paymentCorrection.create({
      data: {
        eventId,
        authorId,
        personalBillId: billId,
        title: [bill.unitLabel ?? bill.merchantName, qty ? `${qty}×` : null].filter(Boolean).join(" ") || "Osobní účtenka",
        amountCzk: amount,
        paidAt: paid.map((p) => p.settledAt!).sort((a, b) => a.getTime() - b.getTime())[0],
        note,
        userId,
      },
    });
    return { ok: true as const, amountCzk: amount };
  });
}
