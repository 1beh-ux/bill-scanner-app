// Bill import from a table -- the server half. Each row names a Drive file
// (link or id) plus optional bill data. The dry run (preview) validates and
// resolves every row without touching Drive; the real run downloads each file
// with the event's Drive identity, ingests it as ONE bill (no PDF split -- one
// row = one file = one bill in the source), applies the row's data exactly as
// the bill editor would (CZK conversion, category splits), and optionally
// approves complete bills through the normal approveBill.

import { Prisma } from "@/generated/prisma";
import type { Currency } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { downloadFileBuffer, getDriveFileMeta, isGoogleNativeFile, toDriveError } from "@/lib/drive";
import { ingestBillFiles } from "@/lib/bill-ingest";
import { ensureAuthorEventAccess, findOrCreateAuthorForSubfolder } from "@/lib/drive-import";
import { convertToCzk } from "@/lib/exchange-rates";
import { approveBill } from "@/lib/bill-actions";
import { parseAmount, parseBillCategories, parseCurrency, parseDriveFileId } from "@/lib/bills-import";
import { fold, parseBool, parseDate } from "@/lib/planning-import";

export type BillImportRecord = Record<string, string>;
export type BillImportOptions = { approveComplete: boolean; createMissing: boolean };
// row = index into the submitted records; code -> billImport.issue.<code>
export type BillImportIssue = { row: number; code: string; value?: string };
export type BillImportResult = { counts: Record<string, number>; errors: BillImportIssue[]; warnings: BillImportIssue[] };

type ParsedRow = {
  row: number;
  fileId: string;
  merchant: string | null;
  date: string | null;
  amount: number | null;
  currency: Currency;
  payerName: string | null;
  categories: { name: string; amount: number | null }[];
  notes: string | null;
  paid: boolean | null;
};

export async function runBillImport(
  eventId: string,
  userId: string,
  records: BillImportRecord[],
  options: BillImportOptions,
  dryRun: boolean,
  rowOffset = 0, // the client sends big imports in chunks; issues report sheet rows
  rowNumbers?: number[] // explicit table row per record (rows can be unticked, so not contiguous)
): Promise<BillImportResult> {
  const counts: Record<string, number> = {};
  const errors: BillImportIssue[] = [];
  const warnings: BillImportIssue[] = [];
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  const get = (r: BillImportRecord, k: string) => (r[k] ?? "").trim();

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { startDate: true, status: true } });
  if (event.status === "closed") return { counts, errors: [{ row: rowOffset, code: "event_closed" }], warnings };
  const year = event.startDate.getUTCFullYear();

  // ---- parse + validate (no Drive, no writes) ----
  const parsed: ParsedRow[] = [];
  const seen = new Set<string>();
  records.forEach((r, i) => {
    const row = rowNumbers?.[i] ?? i + rowOffset;
    const fileId = parseDriveFileId(get(r, "file"));
    if (!fileId) return errors.push({ row, code: get(r, "file") ? "invalid_file_link" : "missing_file", value: get(r, "file") });
    if (seen.has(fileId)) return warnings.push({ row, code: "duplicate_in_table" });
    seen.add(fileId);

    const amount = get(r, "amount") ? parseAmount(get(r, "amount")) : null;
    if (get(r, "amount") && amount === null) return errors.push({ row, code: "invalid_amount", value: get(r, "amount") });
    const date = get(r, "date") ? parseDate(get(r, "date"), year) : null;
    if (get(r, "date") && !date) return errors.push({ row, code: "invalid_date", value: get(r, "date") });
    const currency = parseCurrency(get(r, "currency")) ?? parseCurrency(get(r, "amount")) ?? "CZK";
    if (get(r, "currency") && !parseCurrency(get(r, "currency"))) warnings.push({ row, code: "unknown_currency", value: get(r, "currency") });
    const paid = get(r, "paid") ? parseBool(get(r, "paid")) : null;
    if (get(r, "paid") && paid === null) warnings.push({ row, code: "invalid_bool", value: get(r, "paid") });

    parsed.push({
      row,
      fileId,
      merchant: get(r, "merchant") || null,
      date,
      amount,
      currency,
      payerName: get(r, "payer") || null,
      categories: parseBillCategories(get(r, "categories")),
      notes: get(r, "notes") || null,
      paid,
    });
  });

  // Already imported (by Drive file id) -> skipped, same rule as the Drive-folder import.
  const already = new Set(
    (await prisma.bill.findMany({ where: { eventId, driveSourceFileId: { in: parsed.map((p) => p.fileId) } }, select: { driveSourceFileId: true } }))
      .map((b) => b.driveSourceFileId)
  );
  const todo = parsed.filter((p) => {
    if (!already.has(p.fileId)) return true;
    warnings.push({ row: p.row, code: "already_imported" });
    bump("skipped");
    return false;
  });

  // Names -> event categories / payers (created when allowed).
  const eventCategories = await prisma.eventCategory.findMany({ where: { eventId }, select: { id: true, name: true } });
  const categoryByName = new Map(eventCategories.map((c) => [fold(c.name), c.id]));
  const missingCategories = new Map<string, string>();
  const authors = await prisma.author.findMany({ where: { active: true }, select: { id: true, canonicalName: true } });
  const authorByName = new Map(authors.map((a) => [fold(a.canonicalName), a.id]));
  const missingPayers = new Map<string, string>();
  for (const p of todo) {
    for (const c of p.categories) {
      if (categoryByName.has(fold(c.name))) continue;
      if (options.createMissing) missingCategories.set(fold(c.name), c.name);
      else warnings.push({ row: p.row, code: "unknown_category", value: c.name });
    }
    if (p.payerName && !authorByName.has(fold(p.payerName))) {
      if (options.createMissing) missingPayers.set(fold(p.payerName), p.payerName);
      else warnings.push({ row: p.row, code: "unknown_payer", value: p.payerName });
    }
    if (p.categories.filter((c) => c.amount === null).length > 1) warnings.push({ row: p.row, code: "category_amounts_incomplete" });
  }
  counts.categoriesCreated = missingCategories.size;
  counts.payersCreated = missingPayers.size;
  if (dryRun) {
    counts.toImport = todo.length;
    return { counts, errors, warnings };
  }

  for (const [key, name] of missingCategories) {
    const c = await prisma.eventCategory.create({ data: { eventId, name, budgetAmount: 0 } });
    categoryByName.set(key, c.id);
  }
  for (const [key, name] of missingPayers) {
    const { author } = await findOrCreateAuthorForSubfolder(name);
    authorByName.set(key, author.id);
  }

  // ---- download + ingest + apply, one row at a time ----
  for (const p of todo) {
    try {
      const meta = await getDriveFileMeta(eventId, p.fileId);
      if (isGoogleNativeFile(meta.mimeType)) {
        errors.push({ row: p.row, code: "google_doc_file", value: meta.name });
        continue;
      }
      const payerAuthorId = p.payerName ? authorByName.get(fold(p.payerName)) : undefined;
      if (payerAuthorId) await ensureAuthorEventAccess(payerAuthorId, eventId);
      const buffer = await downloadFileBuffer(eventId, p.fileId);
      const ingest = await ingestBillFiles(
        eventId,
        userId,
        "drive",
        [{ filename: meta.name, buffer, contentType: meta.mimeType, driveSourceFileId: p.fileId, payerAuthorId }],
        { splitPdfs: false }
      );
      const bill = ingest.created[0];
      if (!bill) {
        warnings.push({ row: p.row, code: ingest.failures.length ? "invalid_file" : "duplicate_file", value: meta.name });
        bump("skipped");
        continue;
      }
      const categories = p.categories.flatMap((c) => {
        const id = categoryByName.get(fold(c.name));
        return id ? [{ eventCategoryId: id, amount: c.amount }] : [];
      });
      await applyImportedBillData(bill.id, { ...p, categories, hasPayer: !!payerAuthorId });
      bump("created");
      if (options.approveComplete) {
        const approved = await approveBill(bill.id, userId);
        if (approved.ok) bump("approved");
        else warnings.push({ row: p.row, code: "not_approved", value: approved.error });
      }
    } catch (err) {
      const e = await toDriveError(eventId, err, { purpose: "read" }).catch(() => null);
      errors.push({ row: p.row, code: e?.code === "not_found_or_no_access" ? "file_no_access" : "file_failed", value: p.fileId });
    }
  }
  return { counts, errors, warnings };
}

/**
 * A freshly ingested bill takes the row's data the way the bill editor would
 * set it: CZK amount/rate from the bill date (convertToCzk), category splits
 * in the bill's currency with their CZK equivalents, status "to_review".
 * One category without an amount takes the whole bill; with several, the one
 * missing an amount takes the remainder.
 */
export async function applyImportedBillData(
  billId: string,
  d: {
    merchant: string | null;
    date: string | null;
    amount: number | null;
    currency: Currency;
    notes: string | null;
    paid: boolean | null;
    hasPayer: boolean;
    categories: { eventCategoryId: string; amount: number | null }[];
  }
) {
  const billDate = d.date ? new Date(`${d.date}T00:00:00Z`) : null;
  const total = d.amount !== null ? new Prisma.Decimal(d.amount) : null;
  let amountCzk: Prisma.Decimal | null = null;
  let rate: Prisma.Decimal | null = null;
  let rateDate: Date | null = null;
  if (total !== null && (d.currency === "CZK" || billDate)) {
    const conv = await convertToCzk(total, d.currency, billDate ?? new Date());
    if (conv) {
      amountCzk = conv.amountCzk;
      rate = conv.rateUsed;
      rateDate = conv.rateDate;
    }
  }

  // Category amounts: explicit ones as given; at most one without an amount takes the rest.
  const given = d.categories.filter((c) => c.amount !== null).reduce((n, c) => n.plus(c.amount!), new Prisma.Decimal(0));
  const open = d.categories.filter((c) => c.amount === null);
  const splits: { eventCategoryId: string; amount: Prisma.Decimal }[] =
    open.length > 1
      ? d.categories.flatMap((c) => (c.amount !== null ? [{ eventCategoryId: c.eventCategoryId, amount: new Prisma.Decimal(c.amount) }] : []))
      : d.categories.flatMap((c) => {
          const amount = c.amount !== null ? new Prisma.Decimal(c.amount) : total ? total.minus(given) : null;
          return amount !== null && amount.gt(0) ? [{ eventCategoryId: c.eventCategoryId, amount }] : [];
        });

  await prisma.$transaction(async (tx) => {
    await tx.bill.update({
      where: { id: billId },
      data: {
        merchantName: d.merchant,
        billDate,
        totalAmount: total,
        currency: d.currency,
        amountCzk,
        exchangeRateUsed: rate,
        exchangeRateDate: rateDate,
        notes: d.notes,
        status: "to_review",
        // No payer = paid by the event itself, nothing to reimburse (bill editor rule).
        paidToAuthor: d.hasPayer ? d.paid === true : true,
        paidAt: d.hasPayer && d.paid === true ? new Date() : null,
      },
    });
    const seenCategory = new Set<string>();
    for (const s of splits) {
      if (seenCategory.has(s.eventCategoryId)) continue;
      seenCategory.add(s.eventCategoryId);
      await tx.billCategory.create({
        data: { billId, eventCategoryId: s.eventCategoryId, amount: s.amount, amountCzk: rate ? s.amount.times(rate).toDecimalPlaces(2) : null },
      });
    }
  });
}
