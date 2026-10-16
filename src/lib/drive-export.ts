import path from "path";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { billsBucket } from "@/lib/gcs";
import {
  uploadFileToFolder,
  createManifestSheet,
  writeManifestValues,
  findFileInFolder,
  writeSheetTab,
} from "@/lib/drive";
import { computeSettlement } from "@/lib/settlement";
import { officialAccountOf } from "@/lib/official-account";
import { DriveError } from "@/lib/drive-errors";
import { effectiveAmountCzk } from "@/lib/bill-amount";
import { getBillPaymentStates } from "@/lib/bank/payment-state";
import { buildManifestRows, buildSummaryRows, SUMMARY_SHEET_TITLE } from "@/lib/manifest";

export class DriveExportError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export interface ExportSummary {
  totalApproved: number;
  newlyExported: number;
  alreadyExported: number;
  exportFailures: { filename: string; error: string }[];
  manifestSpreadsheetId: string;
}

function mimeTypeForExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".pdf":
      return "application/pdf";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".heic":
      return "image/heic";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

/**
 * Wraps a raster image into a single-page PDF, so every export is a PDF
 * regardless of what format the bill is stored in internally. Only PNG/JPEG
 * are handled — everything this app actually produces — a HEIC or WEBP
 * bill would fail here and surface as a reported export failure rather
 * than silently break or crash the whole run.
 */
async function convertImageToPdfBytes(imageBuffer: Buffer, isPng: boolean): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const embeddedImage = isPng
    ? await pdfDoc.embedPng(imageBuffer)
    : await pdfDoc.embedJpg(imageBuffer);

  const { width, height } = embeddedImage;
  const page = pdfDoc.addPage([width, height]);
  page.drawImage(embeddedImage, { x: 0, y: 0, width, height });

  return Buffer.from(await pdfDoc.save());
}

/**
 * Writes the manifest rows into the remembered sheet, or creates the sheet. Prefers
 * the cached id (searching Drive by title before creating caused duplicate
 * manifests under rapid-repeat calls). A remembered sheet that is gone -- or not
 * reachable by the identity now used -- is NOT silently replaced: it raises
 * `manifest_missing` so the user can confirm, and only `recreate: true` makes a
 * new one.
 */
export async function upsertManifest(
  eventId: string,
  o: { exportFolderId: string; cachedSpreadsheetId: string | null; title: string; rows: (string | number)[][]; recreate: boolean }
): Promise<string> {
  if (o.cachedSpreadsheetId) {
    try {
      await writeManifestValues(eventId, o.cachedSpreadsheetId, o.rows);
      return o.cachedSpreadsheetId;
    } catch (err) {
      if (!(err instanceof DriveError) || err.code !== "not_found_or_no_access") throw err;
      if (!o.recreate) throw new DriveError("manifest_missing", { ...err.params, folderLabel: "export" }, err);
    }
  }
  return createManifestSheet(eventId, o.exportFolderId, o.title, o.rows);
}

export async function exportEventBills(eventId: string, opts: { recreateManifest?: boolean } = {}): Promise<ExportSummary> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new DriveExportError("event_not_found");
  if (!event.driveExportFolderId) throw new DriveExportError("no_export_folder");

  const bills = await prisma.bill.findMany({
    where: { eventId, status: "approved" },
    orderBy: { billDate: "asc" },
    include: {
      categories: { include: { eventCategory: true } },
      payerAuthor: true,
    },
  });

  if (bills.length === 0) {
    throw new DriveExportError("no_approved_bills");
  }

  // Filenames already committed on a previous export run are fixed and never
  // reassigned — re-running export doesn't rename or re-upload anything.
  const usedNames = new Set(
    bills.filter((b) => b.exportFilename).map((b) => b.exportFilename as string)
  );

  // Every export is a PDF now, regardless of the source format — images
  // get wrapped into a single-page PDF below, so the extension is always
  // .pdf, not whatever the source file happened to be.
  function resolveExportFilename(displayFilename: string): string {
    let candidate = `${displayFilename}.pdf`;
    let suffix = 2;
    while (usedNames.has(candidate)) {
      candidate = `${displayFilename}_${suffix}.pdf`;
      suffix++;
    }
    usedNames.add(candidate);
    return candidate;
  }

  let newlyExported = 0;
  let alreadyExported = 0;
  const exportFailures: { filename: string; error: string }[] = [];

  // Every run checks Drive itself: an exported file that's no longer in the export folder
  // (deleted / trashed there) is uploaded again under its same name. The lookup also gives the
  // manifest's links below.
  const findOnDrive = (name: string) => findFileInFolder(eventId, event.driveExportFolderId!, name, mimeTypeForExtension(path.extname(name)));
  const onDrive = new Map(
    await Promise.all(bills.filter((b) => b.exportFilename).map(async (b) => [b.id, await findOnDrive(b.exportFilename!)] as const))
  );

  for (const bill of bills) {
    if (bill.exportFilename && bill.exportedAt && onDrive.get(bill.id)) {
      alreadyExported++;
      continue;
    }

    // No document (created from a bank payment): nothing to upload; the manifest says "chybí doklad".
    if (!bill.gcsObjectPath) continue;

    // displayFilename is guaranteed set here — only approved bills reach this
    // query, and approval is what sets displayFilename in the first place.
    // A missing file keeps its name (the manifest and people may refer to it).
    const exportFilename = bill.exportFilename ?? resolveExportFilename(bill.displayFilename as string);

    try {
      const [buffer] = await billsBucket.file(bill.gcsObjectPath).download();
      const sourceExt = path.extname(bill.originalFilename).toLowerCase();
      const uploadBuffer =
        sourceExt === ".pdf" ? buffer : await convertImageToPdfBytes(buffer, sourceExt === ".png");

      const uploaded = await uploadFileToFolder(eventId, event.driveExportFolderId, exportFilename, uploadBuffer, "application/pdf", "export");
      onDrive.set(bill.id, { id: uploaded, name: exportFilename, mimeType: "application/pdf" });

      await prisma.bill.update({
        where: { id: bill.id },
        data: { exportFilename, exportedAt: new Date() },
      });

      // `bills` was loaded before this loop -- keep it in step, or the
      // manifest below shows an empty Soubor/Odkaz for this run's uploads.
      bill.exportFilename = exportFilename;
      newlyExported++;
    } catch (err) {
      // One bill's upload exhausting all retries no longer aborts export
      // for every other bill — it's reported and the rest continue. This
      // bill's exportFilename stays unset, so a future export run will
      // simply try it again from scratch.
      // A failure that hits every file for the same reason (no write access, dead
      // token, quota...) is a setup problem, not a per-file one: stop and report
      // it once, precisely, instead of N identical failures and a bogus manifest.
      if (err instanceof DriveError && err.code !== "drive_unknown" && err.code !== "drive_unavailable" && err.code !== "drive_rate_limited") throw err;
      exportFailures.push({ filename: bill.originalFilename, error: err instanceof DriveError ? err.code : "drive_unknown" });
    }
  }

  // Manifest reflects the full current set of approved bills every run, not
  // just what changed this run -- simpler and safer than incremental updates.
  // Layout: src/lib/manifest.ts (fixed columns + one Kategorie/Částka pair per category).
  //
  // Each file's Drive id is looked up by its exact filename rather than stored,
  // to avoid a second schema field for something cheaply derived. Safe here
  // (unlike the manifest's own id) because this is a pure read.
  const links = bills.map((b) => {
    const found = onDrive.get(b.id);
    return found ? `https://drive.google.com/file/d/${found.id}/view` : "";
  });
  // Banka on: Platba, Datum platby, ID pohybu per bill (only these -- no transaction details).
  const bankOn = !!(await prisma.eventModule.findFirst({ where: { eventId, moduleKey: "bank", enabled: true }, select: { eventId: true } }));
  if (bankOn) {
    const states = await getBillPaymentStates(bills);
    const txIds = [...new Set([...states.values()].flatMap((x) => x.transactionIds))];
    const ext = new Map((await prisma.bankTransaction.findMany({ where: { id: { in: txIds } }, select: { id: true, externalId: true } })).map((x) => [x.id, x.externalId]));
    for (const b of bills as (typeof bills[number] & { bank?: unknown })[]) {
      const st = states.get(b.id)!;
      // Bank movement ids as the bank shows them (fio:123 -> 123); a content hash isn't one.
      b.bank = { state: st.state, paidOn: st.paidOn, movementIds: st.transactionIds.map((t) => ext.get(t) ?? "").filter((x) => x && !x.startsWith("h:")).map((x) => x.replace(/^(fio|id):/, "")) };
    }
  }
  const manifestRows = buildManifestRows(bills, links, event.manifestCategoryMode === "columns" ? "columns" : "pairs", bankOn);

  const manifestTitle = `Manifest - ${event.name}`;

  const manifestSpreadsheetId = await upsertManifest(eventId, {
    exportFolderId: event.driveExportFolderId,
    cachedSpreadsheetId: event.driveManifestSpreadsheetId,
    title: manifestTitle,
    rows: manifestRows,
    recreate: opts.recreateManifest === true,
  });
  if (manifestSpreadsheetId !== event.driveManifestSpreadsheetId) {
    await prisma.event.update({ where: { id: eventId }, data: { driveManifestSpreadsheetId: manifestSpreadsheetId } });
  }

  // Second sheet "Souhrn": budget per category, official account vs cash, deposits, settlement.
  const [categories, deposits, official] = await Promise.all([
    prisma.eventCategory.findMany({ where: { eventId }, orderBy: { name: "asc" } }),
    prisma.eventDeposit.findMany({ where: { eventId }, orderBy: { receivedAt: "asc" } }),
    officialAccountOf(eventId, event.organizationId),
  ]);
  const settlement = computeSettlement({
    categories: categories.map((c) => ({ id: c.id, name: c.name, budget: c.budgetAmount })),
    bills: bills.map((b) => ({ amountCzk: effectiveAmountCzk(b), payerAuthor: b.payerAuthor, categories: b.categories })),
    deposits,
  });
  await writeSheetTab(eventId, manifestSpreadsheetId, SUMMARY_SHEET_TITLE, buildSummaryRows(event.name, settlement, deposits, official ? `${official.accountNumber}/${official.bankCode} (${official.name})` : null));

  return { totalApproved: bills.length, newlyExported, alreadyExported, exportFailures, manifestSpreadsheetId };
}