// Cestovní příkazy (prompt 7 B): access, the worker list, the rate set, saving a draft, Odeslat (freeze + Bill),
// Znovu otevřít, and the payee change. The amounts come only from src/lib/travel-order-calc.ts.
import crypto from "crypto";
import { NextResponse } from "next/server";
import { Prisma, type TravelOrder, type TravelLeg, type TravelRateSet, type User, type VehicleFuel, type VehicleGearbox } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId, notFound } from "@/lib/org-scope";
import { requireModuleAccess } from "@/lib/module-access";
import { billsBucket } from "@/lib/gcs";
import { ADDRESS_KEYS } from "@/lib/adults";
import { cleanBank, setAuthorBank, validateBank } from "@/lib/payers";
import { calcTravelOrder, FUELS, GEARBOXES, normalizePhone, pickRateSet, type CalcError, type CalcResult, type RateValues } from "@/lib/travel-order-calc";
import { dateToWall, mergeWorkers, normName, wallToDate, type WorkerEntry } from "@/lib/travel-orders";
import { renderTravelOrderPdf } from "@/lib/travel-order-pdf";

export type OrderWithLegs = TravelOrder & { legs: TravelLeg[] };

/** Signed in, the order is the acting organization's (else 404), Účtenky access to its event (else 403). */
export async function requireOrderAccess(orderId: string): Promise<{ error: NextResponse } | { user: User; order: OrderWithLegs }> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const order = await prisma.travelOrder.findFirst({ where: { id: orderId, organizationId: await getActingOrgId(user) }, include: { legs: { orderBy: { sortOrder: "asc" } } } });
  if (!order) return { error: notFound() };
  const denied = await requireModuleAccess(user, order.eventId, "bills");
  return denied ? { error: denied } : { user, order };
}

const addressOf = (fv: unknown): string | null => {
  const v = (fv ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof v[k] === "string" ? (v[k] as string).trim() : "");
  const line = [s(ADDRESS_KEYS.street), [s(ADDRESS_KEYS.zip), s(ADDRESS_KEYS.municipality)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return line || null;
};

/** Pracovník picker: the event's adults (Lidé) and payers, one entry per person. */
export async function workerList(eventId: string): Promise<WorkerEntry[]> {
  const [persons, access] = await Promise.all([
    prisma.eventPerson.findMany({
      where: { eventId, child: { isAdult: true } },
      select: { child: { select: { id: true, name: true, fieldValues: true, guardians: { where: { phone: { not: null } }, select: { phone: true }, take: 1 } } } },
    }),
    prisma.authorEventAccess.findMany({
      where: { eventId, author: { mergedIntoAuthorId: null, active: true, isOfficialAccount: false } },
      select: { author: { select: { id: true, canonicalName: true, childId: true, phone: true, address: true, bankAccountNumber: true, bankCode: true } } },
    }),
  ]);
  return mergeWorkers(
    persons.map(({ child: c }) => ({ childId: c.id, name: c.name, address: addressOf(c.fieldValues), phone: normalizePhone(c.guardians[0]?.phone) })),
    access.map(({ author: a }) => ({ authorId: a.id, name: a.canonicalName, childId: a.childId, address: a.address, phone: a.phone, bankAccountNumber: a.bankAccountNumber, bankCode: a.bankCode })),
  );
}

/** The values of a set as stored on an order (strings, nothing lost). */
export const rateValuesOf = (s: TravelRateSet) => ({
  validFrom: s.validFrom.toISOString().slice(0, 10),
  basePerKm: s.basePerKm.toString(),
  trailerSurchargePct: s.trailerSurchargePct.toString(),
  dieselPrice: s.dieselPrice.toString(),
  petrol95Price: s.petrol95Price.toString(),
  petrol98Price: s.petrol98Price.toString(),
  electricityPrice: s.electricityPrice.toString(),
  consumptionDefaults: s.consumptionDefaults as RateValues["consumptionDefaults"],
  note: s.note,
});
export type StoredRates = ReturnType<typeof rateValuesOf>;
export type RateChoice = { id: string | null; values: StoredRates; frozen: boolean; provisional: boolean } | null;

/**
 * The rate set for an order: its frozen values once submitted (also after Znovu otevřít), else the set valid on
 * the start day; a draft with none falls back to the latest set as "předběžná sazba" (provisional).
 */
export async function rateFor(order: Pick<TravelOrder, "organizationId" | "rateSetId" | "rateValues" | "startAt">, eventStart: Date): Promise<RateChoice> {
  if (order.rateValues) return { id: order.rateSetId, values: order.rateValues as StoredRates, frozen: true, provisional: false };
  const sets = await prisma.travelRateSet.findMany({ where: { organizationId: order.organizationId }, orderBy: { validFrom: "desc" } });
  const picked = pickRateSet(sets, order.startAt ?? eventStart);
  if (picked) return { id: picked.id, values: rateValuesOf(picked), frozen: false, provisional: false };
  return sets[0] ? { id: sets[0].id, values: rateValuesOf(sets[0]), frozen: false, provisional: true } : null;
}

type CalcSource = Pick<TravelOrder, "fuel" | "gearbox" | "tpValues" | "receiptPrice" | "priceFromReceipt"> & { legs: Pick<TravelLeg, "km" | "trailer" | "stravne" | "nocleh" | "vedlejsi">[] };
const str = (d: Prisma.Decimal | null) => (d === null ? null : d.toString());

export function calcOf(o: CalcSource, rates: StoredRates | null): CalcResult | CalcError {
  if (!rates) return { ok: false, errors: ["no_rate_set"] };
  if (!o.fuel || !o.gearbox) return { ok: false, errors: ["no_vehicle"] };
  return calcTravelOrder({
    rates,
    fuel: o.fuel,
    gearbox: o.gearbox,
    tp: Array.isArray(o.tpValues) ? (o.tpValues as (string | number | null)[]) : [],
    receiptPrice: o.priceFromReceipt ? str(o.receiptPrice) ?? "0" : null,
    legs: o.legs.map((l) => ({ km: str(l.km), trailer: l.trailer, stravne: str(l.stravne), nocleh: str(l.nocleh), vedlejsi: str(l.vedlejsi) })),
  });
}

// --- the form body -> a draft's data
const text = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) || null : null);
const dec = (v: unknown, places: number): Prisma.Decimal | null => {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim().replace(/\s/g, "").replace(",", ".") : "";
  return /^-?\d+(\.\d+)?$/.test(s) ? new Prisma.Decimal(s).toDecimalPlaces(places, Prisma.Decimal.ROUND_HALF_UP) : null;
};
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null);
const time = (v: unknown) => (typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v.trim()) ? v.trim().padStart(5, "0") : null);
export const FREE_MEALS = ["ubytovani", "snidane", "obed", "vecere"] as const;

/** Everything a draft keeps (not the computed / frozen fields). Unknown ids are dropped by the caller's checks. */
export function parseDraft(b: Record<string, unknown>) {
  const legs = (Array.isArray(b.legs) ? b.legs : []).slice(0, 60).map((raw, i) => {
    const l = (raw ?? {}) as Record<string, unknown>;
    return {
      sortOrder: i,
      date: day(l.date),
      fromPlace: text(l.fromPlace, 200),
      toPlace: text(l.toPlace, 200),
      departTime: time(l.departTime),
      arriveTime: time(l.arriveTime),
      trailer: l.trailer === true,
      km: dec(l.km, 1),
      stravne: dec(l.stravne, 2),
      nocleh: dec(l.nocleh, 2),
      vedlejsi: dec(l.vedlejsi, 2),
    };
  });
  const fm = (b.freeMeals ?? {}) as Record<string, unknown>;
  const tp = Array.isArray(b.tpValues) ? b.tpValues.slice(0, 4).map((v) => (dec(v, 2) ? dec(v, 2)!.toString() : null)) : [];
  const cc = Number(b.cylinderCc);
  return {
    data: {
      workerChildId: text(b.workerChildId, 64),
      workerAuthorId: text(b.workerAuthorId, 64),
      vehicleId: text(b.vehicleId, 64),
      workerName: text(b.workerName, 200),
      workerAddress: text(b.workerAddress, 300),
      workerPhone: normalizePhone(text(b.workerPhone, 40)),
      vehicleLabel: text(b.vehicleLabel, 100),
      vehiclePlate: text(b.vehiclePlate, 20)?.toUpperCase() ?? null,
      cylinderCc: Number.isInteger(cc) && cc > 0 && cc < 20000 ? cc : null,
      gearbox: GEARBOXES.includes(b.gearbox as never) ? (b.gearbox as VehicleGearbox) : null,
      fuel: FUELS.includes(b.fuel as never) ? (b.fuel as VehicleFuel) : null,
      tpValues: tp,
      payoutMethod: b.payoutMethod === "cash" ? "cash" : "bank",
      payoutName: text(b.payoutName, 200),
      payoutAccountNumber: text(b.payoutAccountNumber, 40),
      payoutBankCode: text(b.payoutBankCode, 10),
      priceFromReceipt: b.priceFromReceipt === true,
      receiptPrice: dec(b.receiptPrice, 2),
      receiptBillId: text(b.receiptBillId, 64),
      purpose: text(b.purpose, 500),
      originPlace: text(b.originPlace, 200),
      destinationPlace: text(b.destinationPlace, 200),
      roundTrip: b.roundTrip !== false,
      startAt: wallToDate(b.startAt),
      endAt: wallToDate(b.endAt),
      approvalDate: day(b.approvalDate),
      approverName: text(b.approverName, 200),
      coTravellers: text(b.coTravellers, 500),
      freeMeals: Object.fromEntries(FREE_MEALS.map((k) => [k, fm[k] === true])),
    },
    legs,
  };
}

/** The ids in a draft must be this event's / organization's; anything else is dropped (null). */
export async function checkDraftIds(d: ReturnType<typeof parseDraft>["data"], eventId: string, organizationId: string) {
  const [child, author, vehicle, receipt] = await Promise.all([
    d.workerChildId ? prisma.child.count({ where: { id: d.workerChildId, organizationId, isAdult: true } }) : 1,
    d.workerAuthorId ? prisma.authorEventAccess.count({ where: { authorId: d.workerAuthorId, eventId } }) : 1,
    d.vehicleId ? prisma.vehicle.count({ where: { id: d.vehicleId, organizationId } }) : 1,
    d.receiptBillId ? prisma.bill.count({ where: { id: d.receiptBillId, eventId } }) : 1,
  ]);
  return !child || !author || !vehicle || !receipt ? "not_found" : null;
}

/** The order as the form edits it (strings). */
export function orderForm(o: OrderWithLegs) {
  const s = (d: Prisma.Decimal | null) => (d === null ? "" : d.toString());
  return {
    ...o,
    startAt: dateToWall(o.startAt),
    endAt: dateToWall(o.endAt),
    approvalDate: o.approvalDate ? o.approvalDate.toISOString().slice(0, 10) : "",
    receiptPrice: s(o.receiptPrice),
    legs: o.legs.map((l) => ({ ...l, date: l.date ? l.date.toISOString().slice(0, 10) : "", km: s(l.km), stravne: s(l.stravne), nocleh: s(l.nocleh), vedlejsi: s(l.vedlejsi), departTime: l.departTime ?? "", arriveTime: l.arriveTime ?? "", fromPlace: l.fromPlace ?? "", toPlace: l.toPlace ?? "" })),
  };
}

// --- Odeslat
export type SubmitError = { error: string; date?: string; legs?: number[] };

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** The event's "Doprava" category (created like a category added by hand, from the template when there is one). */
async function transportCategory(tx: Prisma.TransactionClient, eventId: string, organizationId: string): Promise<string> {
  const cats = await tx.eventCategory.findMany({ where: { eventId }, select: { id: true, name: true } });
  const found = cats.find((c) => normName(c.name) === "doprava");
  if (found) return found.id;
  const tpl = await tx.categoryTemplate.findFirst({ where: { organizationId, name: { equals: "Doprava", mode: "insensitive" } }, select: { id: true, description: true } });
  const c = await tx.eventCategory.create({ data: { eventId, name: "Doprava", description: tpl?.description ?? null, budgetAmount: 0, isFromTemplate: !!tpl, categoryTemplateId: tpl?.id ?? null } });
  return c.id;
}

/** Freeze, compute, create (or after Znovu otevřít update) the Bill. Nothing is written when anything blocks. */
export async function submitOrder(order: OrderWithLegs, user: User): Promise<SubmitError | { ok: true; billId: string }> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: order.eventId }, select: { name: true, startDate: true, status: true } });
  if (event.status === "closed") return { error: "event_closed_locked" };
  if (order.status !== "draft") return { error: "not_draft" };
  if (!order.startAt || !order.endAt) return { error: "no_dates" };
  if (!order.workerName) return { error: "no_worker" };
  if (!order.vehicleLabel || !order.fuel || !order.gearbox) return { error: "no_vehicle" };
  const rates = await rateFor(order, event.startDate);
  if (!rates || rates.provisional) return { error: "no_rate_set", date: order.startAt.toISOString().slice(0, 10) };
  const calc = calcOf(order, rates.values);
  if (!calc.ok) return { error: calc.errors.includes("no_legs") ? "no_legs" : calc.errors[0].startsWith("leg_") ? "bad_legs" : calc.errors[0], legs: calc.errors.filter((e) => e.startsWith("leg_")).map((e) => Number(e.split(":")[1])) };
  const bank = cleanBank(order.payoutAccountNumber, order.payoutBankCode);
  if (order.payoutMethod === "bank" && (!bank.account || !bank.code || validateBank(bank))) return { error: "payout_missing" };

  // The payee: the worker's payer, else a new payer made from the worker (attached to the event).
  let payerId = order.workerAuthorId;
  const existingBill = order.billId ? await prisma.bill.findUnique({ where: { id: order.billId }, select: { id: true, gcsObjectPath: true, payerAuthorId: true, paidToAuthor: true } }) : null;
  if (existingBill) payerId = existingBill.payerAuthorId ?? payerId;
  const payer = payerId ? await prisma.author.findUnique({ where: { id: payerId }, select: { id: true, canonicalName: true, bankAccountNumber: true } }) : null;
  const payoutName = payer?.canonicalName ?? order.workerName;
  const total = new Prisma.Decimal(calc.total);
  const values = {
    ...order,
    payoutName,
    consumptionUsed: new Prisma.Decimal(calc.consumption),
    consumptionSource: calc.consumptionSource,
    fuelPriceUsed: new Prisma.Decimal(calc.price),
    rateSetId: rates.id,
    rateValues: rates.values,
    totalKm: new Prisma.Decimal(calc.totalKm),
    totalAmount: total,
  };
  const pdf = await renderTravelOrderPdf(values, calc);
  const path = `events/${order.eventId}/travel-orders/${order.id}-${crypto.randomUUID().slice(0, 8)}.pdf`;
  await billsBucket.file(path).save(pdf, { contentType: "application/pdf" });
  const filename = `cestovni-prikaz-${slug(order.workerName)}-${order.startAt.toISOString().slice(0, 10)}.pdf`;
  const billDate = new Date(`${order.startAt.toISOString().slice(0, 10)}T00:00:00Z`);

  const billId = await prisma.$transaction(async (tx) => {
    let authorId = payer?.id ?? null;
    if (!authorId) {
      const created = await tx.author.create({ data: { canonicalName: order.workerName!, organizationId: order.organizationId, childId: order.workerChildId, phone: order.workerPhone, address: order.workerAddress } });
      authorId = created.id;
      if (bank.account && bank.code) await setAuthorBank(tx, { authorId, bank, userId: user.id, eventId: order.eventId, source: "create" });
    } else if (!payer!.bankAccountNumber && bank.account && bank.code && order.payoutMethod === "bank") {
      await setAuthorBank(tx, { authorId, bank, userId: user.id, eventId: order.eventId, source: "event_edit" });
    }
    await tx.authorEventAccess.upsert({ where: { authorId_eventId: { authorId, eventId: order.eventId } }, update: {}, create: { authorId, eventId: order.eventId } });

    const billData = {
      gcsObjectPath: path,
      originalFilename: filename,
      sizeBytes: BigInt(pdf.length),
      merchantName: order.workerName,
      billDate,
      totalAmount: total,
      currency: "CZK" as const,
      amountCzk: total,
      exchangeRateUsed: new Prisma.Decimal(1),
      exchangeRateDate: billDate,
      payerAuthorId: authorId,
      status: "to_review" as const,
      notes: order.purpose,
    };
    let id: string;
    if (existingBill) {
      id = existingBill.id;
      await tx.bill.update({ where: { id }, data: billData });
      const cats = await tx.billCategory.findMany({ where: { billId: id }, select: { id: true } });
      if (cats.length === 1) await tx.billCategory.update({ where: { id: cats[0].id }, data: { amount: total, amountCzk: total } });
      else {
        await tx.billCategory.deleteMany({ where: { billId: id } });
        await tx.billCategory.create({ data: { billId: id, eventCategoryId: await transportCategory(tx, order.eventId, order.organizationId), amount: total, amountCzk: total } });
      }
    } else {
      id = (await tx.bill.create({ data: { ...billData, eventId: order.eventId, contentHash: `travel_order:${order.id}`, ingestChannel: "travel_order", createdByUserId: user.id }, select: { id: true } })).id;
      await tx.billCategory.create({ data: { billId: id, eventCategoryId: await transportCategory(tx, order.eventId, order.organizationId), amount: total, amountCzk: total } });
    }
    await tx.billAuditLog.create({ data: { billId: id, userId: user.id, actionType: "edit", fieldName: "travel_order", oldValue: existingBill ? "reopened" : null, newValue: `submitted ${calc.total}` } });

    await tx.travelOrder.update({
      where: { id: order.id },
      data: {
        status: "submitted",
        submittedAt: new Date(),
        billId: id,
        payoutName,
        consumptionUsed: values.consumptionUsed,
        consumptionSource: values.consumptionSource,
        fuelPriceUsed: values.fuelPriceUsed,
        rateSetId: rates.id,
        rateValues: rates.values,
        totalKm: values.totalKm,
        totalAmount: total,
        pdfPath: path,
      },
    });
    for (const l of calc.legs) await tx.travelLeg.update({ where: { id: order.legs[l.index].id }, data: { kmAmount: new Prisma.Decimal(l.kmAmount), amount: new Prisma.Decimal(l.total) } });
    // Suggestions for the next orders (never applied silently).
    for (const l of order.legs)
      if (l.fromPlace && l.toPlace && l.km && l.km.gt(0))
        await tx.knownDistance.upsert({ where: { organizationId_fromPlace_toPlace: { organizationId: order.organizationId, fromPlace: l.fromPlace, toPlace: l.toPlace } }, update: { km: l.km }, create: { organizationId: order.organizationId, fromPlace: l.fromPlace, toPlace: l.toPlace, km: l.km } });
    return id;
  }, { timeout: 30_000 });
  if (existingBill?.gcsObjectPath && existingBill.gcsObjectPath !== path) await billsBucket.file(existingBill.gcsObjectPath).delete().catch(() => {});
  return { ok: true, billId };
}

/** Znovu otevřít: back to a draft (audited on the bill); the frozen rate values stay, so it recalculates with them. */
export async function reopenOrder(order: OrderWithLegs, user: User): Promise<{ error: string } | { ok: true }> {
  if (order.status !== "submitted") return { error: "not_submitted" };
  const event = await prisma.event.findUniqueOrThrow({ where: { id: order.eventId }, select: { status: true } });
  if (event.status === "closed") return { error: "event_closed_locked" };
  const bill = order.billId ? await prisma.bill.findUnique({ where: { id: order.billId }, select: { id: true, status: true, paidToAuthor: true, exportedAt: true } }) : null;
  if (bill?.paidToAuthor) return { error: "bill_paid_locked" };
  await prisma.$transaction(async (tx) => {
    await tx.travelOrder.update({ where: { id: order.id }, data: { status: "draft", submittedAt: null } });
    if (bill) {
      // Never "new" (that is the AI's entry state): straight back to review.
      await tx.bill.update({ where: { id: bill.id }, data: { status: "to_review", approvedAt: null, approvedByUserId: null } });
      await tx.billAuditLog.create({ data: { billId: bill.id, userId: user.id, actionType: "reopen", fieldName: "travel_order", oldValue: bill.status, newValue: "draft" } });
    }
  });
  return { ok: true };
}

/**
 * The bill's payer changed (bill PATCH): the order's payout block follows -- name, account (the payee's), and a
 * regenerated PDF with its QR. The worker and vehicle snapshots are not touched. The bill route audits the change.
 */
export async function applyTravelPayee(billId: string, userId: string): Promise<void> {
  const order = await prisma.travelOrder.findUnique({ where: { billId }, include: { legs: { orderBy: { sortOrder: "asc" } } } });
  const bill = await prisma.bill.findUnique({ where: { id: billId }, select: { gcsObjectPath: true, payerAuthor: { select: { canonicalName: true, bankAccountNumber: true, bankCode: true } } } });
  if (!order || !bill || order.status !== "submitted") return;
  const p = bill.payerAuthor;
  const payout = { payoutName: p?.canonicalName ?? null, payoutAccountNumber: p?.bankAccountNumber ?? null, payoutBankCode: p?.bankCode ?? null };
  const next = { ...order, ...payout };
  const calc = calcOf(next, next.rateValues as StoredRates);
  if (!calc.ok) return;
  const pdf = await renderTravelOrderPdf(next, calc);
  const path = `events/${order.eventId}/travel-orders/${order.id}-${crypto.randomUUID().slice(0, 8)}.pdf`;
  await billsBucket.file(path).save(pdf, { contentType: "application/pdf" });
  await prisma.$transaction([
    prisma.travelOrder.update({ where: { id: order.id }, data: { ...payout, pdfPath: path } }),
    prisma.bill.update({ where: { id: billId }, data: { gcsObjectPath: path, sizeBytes: BigInt(pdf.length) } }),
    prisma.billAuditLog.create({ data: { billId, userId, actionType: "edit", fieldName: "travel_order_payee", oldValue: order.payoutName, newValue: payout.payoutName } }),
  ]);
  if (bill.gcsObjectPath && bill.gcsObjectPath !== path) await billsBucket.file(bill.gcsObjectPath).delete().catch(() => {});
}
