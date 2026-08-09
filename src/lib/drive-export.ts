import path from "path";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { billsBucket } from "@/lib/gcs";
import {
  uploadFileToFolder,
  createManifestSheet,
  writeManifestValues,
  findFileInFolder,
} from "@/lib/drive";

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

function proplacenoLabel(payerAuthorId: string | null, paidToAuthor: boolean): string {
  // No payer means the event paid directly — nothing to reimburse, so "Akce"
  // rather than a bare yes/no, matching the same convention already used in
  // the Zaplatil column for this case.
  if (!payerAuthorId) return "Akce";
  return paidToAuthor ? "Ano" : "Ne";
}

export async function exportEventBills(eventId: string): Promise<ExportSummary> {
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

  for (const bill of bills) {
    if (bill.exportFilename && bill.exportedAt) {
      alreadyExported++;
      continue;
    }

    // displayFilename is guaranteed set here — only approved bills reach this
    // query, and approval is what sets displayFilename in the first place.
    const exportFilename = resolveExportFilename(bill.displayFilename as string);

    try {
      const [buffer] = await billsBucket.file(bill.gcsObjectPath).download();
      const sourceExt = path.extname(bill.originalFilename).toLowerCase();
      const uploadBuffer =
        sourceExt === ".pdf" ? buffer : await convertImageToPdfBytes(buffer, sourceExt === ".png");

      await uploadFileToFolder(event.driveExportFolderId, exportFilename, uploadBuffer, "application/pdf");

      await prisma.bill.update({
        where: { id: bill.id },
        data: { exportFilename, exportedAt: new Date() },
      });

      newlyExported++;
    } catch (err) {
      // One bill's upload exhausting all retries no longer aborts export
      // for every other bill — it's reported and the rest continue. This
      // bill's exportFilename stays unset, so a future export run will
      // simply try it again from scratch.
      exportFailures.push({ filename: bill.originalFilename, error: String(err) });
    }
  }

  // Manifest reflects the full current set of approved bills every run, not
  // just what changed this run — simpler and safer than incremental updates.
  // Kategorie is last by design, to keep column order stable/consistent with
  // the rest of the app's conventions rather than leading with it.
  const header = ["Datum", "Obchod", "Částka", "Měna", "Částka Kč", "Zaplatil", "Proplaceno", "Soubor", "Odkaz", "Kategorie"];

  const rows = await Promise.all(
    bills.map(async (b) => {
      const categoryLabel = b.categories.map((c) => c.eventCategory.name).join(", ");
      const proplaceno = proplacenoLabel(b.payerAuthorId, b.paidToAuthor);

      // Looking up each file's Drive id by its known exact filename, rather
      // than storing it, to avoid a second schema field for something we can
      // cheaply derive. Safe here (unlike the manifest's own id) because this
      // is a pure read, never a search-then-create.
      let link = "";
      if (b.exportFilename) {
        const found = await findFileInFolder(
          event.driveExportFolderId!,
          b.exportFilename,
          mimeTypeForExtension(path.extname(b.exportFilename))
        );
        if (found) link = `https://drive.google.com/file/d/${found.id}/view`;
      }

      return [
        b.billDate ? b.billDate.toISOString().slice(0, 10) : "",
        b.merchantName ?? "",
        b.totalAmount?.toString() ?? "",
        b.currency,
        b.amountCzk?.toString() ?? "",
        b.payerAuthor?.canonicalName ?? "Akce",
        proplaceno,
        b.exportFilename ?? "",
        link,
        categoryLabel,
      ];
    })
  );

  const manifestTitle = `Manifest - ${event.name}`;
  const manifestRows = [header, ...rows];

  // Prefer the cached ID from a previous run — avoids searching Drive by
  // title before deciding whether to create, which caused duplicate manifest
  // files under rapid-repeat calls (see createManifestSheet's comment).
  let manifestSpreadsheetId: string | null = event.driveManifestSpreadsheetId;

  if (manifestSpreadsheetId) {
    try {
      await writeManifestValues(manifestSpreadsheetId, manifestRows);
    } catch {
      // Stale ID — deleted, or trashed (writeManifestValues checks this
      // explicitly). Fall back to creating a fresh one.
      manifestSpreadsheetId = null;
    }
  }

  if (!manifestSpreadsheetId) {
    manifestSpreadsheetId = await createManifestSheet(event.driveExportFolderId, manifestTitle, manifestRows);
    await prisma.event.update({
      where: { id: eventId },
      data: { driveManifestSpreadsheetId: manifestSpreadsheetId },
    });
  }

  if (!manifestSpreadsheetId) {
    throw new Error("Failed to resolve a manifest spreadsheet id");
  }

  return { totalApproved: bills.length, newlyExported, alreadyExported, exportFailures, manifestSpreadsheetId };
}