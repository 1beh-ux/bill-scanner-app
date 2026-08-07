import path from "path";
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

  function resolveExportFilename(displayFilename: string, originalFilename: string): string {
    const ext = path.extname(originalFilename);
    let candidate = `${displayFilename}${ext}`;
    let suffix = 2;
    while (usedNames.has(candidate)) {
      candidate = `${displayFilename}_${suffix}${ext}`;
      suffix++;
    }
    usedNames.add(candidate);
    return candidate;
  }

  let newlyExported = 0;
  let alreadyExported = 0;

  for (const bill of bills) {
    if (bill.exportFilename && bill.exportedAt) {
      alreadyExported++;
      continue;
    }

    // displayFilename is guaranteed set here — only approved bills reach this
    // query, and approval is what sets displayFilename in the first place.
    const exportFilename = resolveExportFilename(bill.displayFilename as string, bill.originalFilename);
    const [buffer] = await billsBucket.file(bill.gcsObjectPath).download();
    const mimeType = mimeTypeForExtension(path.extname(exportFilename));

    await uploadFileToFolder(event.driveExportFolderId, exportFilename, buffer, mimeType);

    await prisma.bill.update({
      where: { id: bill.id },
      data: { exportFilename, exportedAt: new Date() },
    });

    newlyExported++;
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

  return { totalApproved: bills.length, newlyExported, alreadyExported, manifestSpreadsheetId };
}