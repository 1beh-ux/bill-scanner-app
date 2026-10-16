// "Úklid souborů na Disku" (Účtenky): which files in given Drive folders are used by bills, which
// are duplicates, and moving the confirmed ones to a cleaned folder / duplicates to the bin.
// Matching needs no download: Drive keeps a SHA-256 of every uploaded file, and a bill's contentHash
// is the SHA-256 of its file (a page split from a PDF: sha256("<pdf sha256>:page:<n>"),
// src/lib/bill-ingest.ts).
import crypto from "crypto";
import type { User } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { hasModuleAccess } from "@/lib/module-access";
import { isGoogleNativeFile, listFolderTree, moveDriveFile, trashDriveFile, type DriveTreeFile } from "@/lib/drive";
import { DriveError, parseFolderId } from "@/lib/drive-errors";
import { needsPayout } from "@/lib/payout";
import { getBillPaymentStates } from "@/lib/bank/payment-state";

// How a file was recognised, strongest first.
export type MatchVia = "drive_id" | "content" | "page" | "export_name";
export type FileMatch = {
  billId: string; eventId: string; eventName: string; accessible: boolean; via: MatchVia;
  status?: string; merchant?: string | null; amountCzk?: number | null; billDate?: string | null; displayFilename?: string | null;
  paid?: "paid" | "unpaid" | "none"; payment?: string | null;
};
export type CleanupRow = {
  fileId: string; name: string; folderId: string; folderPath: string; size: number | null; modifiedTime: string | null; link: string | null; mimeType: string;
  matches: FileMatch[];
  // Same content as other scanned files: the group's key and whether this one is the copy to keep.
  duplicateGroup: string | null; keeper: boolean;
  // A matched bill's content exists as a bill in more than one event.
  billInSeveralEvents: boolean;
  proposed: "move" | "trash" | "none";
};

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** The fingerprints of the bills split from a PDF with this SHA-256 (src/lib/bill-ingest.ts). */
export const pageHashes = (pdfSha: string, max = 40) => Array.from({ length: max }, (_, i) => sha(`${pdfSha}:page:${i + 1}`));

/** How a bill uses a Drive file (strongest first), or null. Pure. */
export function matchVia(
  file: { id: string; name: string; sha256Checksum?: string },
  bill: { driveSourceFileId: string | null; contentHash: string; exportFilename: string | null },
  pageOf: Map<string, string>
): MatchVia | null {
  if (bill.driveSourceFileId === file.id) return "drive_id";
  if (file.sha256Checksum && bill.contentHash === file.sha256Checksum) return "content";
  if (file.sha256Checksum && pageOf.get(bill.contentHash) === file.sha256Checksum) return "page";
  if (bill.exportFilename && bill.exportFilename === file.name) return "export_name";
  return null;
}

/**
 * Duplicates among scanned files (same SHA-256): the copy a bill uses is kept (imported-from-Drive
 * first, then any match), else the oldest; the others are proposed for the bin. Mutates rows. Pure.
 */
export function markDuplicates(rows: CleanupRow[], hashOf: (r: CleanupRow) => string | undefined) {
  const byHash = new Map<string, CleanupRow[]>();
  for (const r of rows) {
    const h = hashOf(r);
    if (h) byHash.set(h, [...(byHash.get(h) ?? []), r]);
  }
  const rank = (r: CleanupRow) => (r.matches.some((m) => m.via === "drive_id") ? 0 : r.matches.length ? 1 : 2);
  for (const [h, group] of byHash) {
    if (group.length < 2) continue;
    [...group]
      .sort((a, b) => rank(a) - rank(b) || (a.modifiedTime ?? "").localeCompare(b.modifiedTime ?? ""))
      .forEach((r, i) => {
        r.duplicateGroup = h.slice(0, 12);
        r.keeper = i === 0;
        if (i > 0) r.proposed = "trash";
      });
  }
}
const MAX_PAGES = 40;
const chunks = <T,>(a: T[], n = 2000) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export async function scanFolders(o: { eventId: string; user: User; folders: string[]; recursive: boolean }) {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: o.eventId }, select: { organizationId: true } });
  const folderIds = [...new Set(o.folders.map((f) => parseFolderId(f)).filter((x): x is string => !!x))].slice(0, 20);
  const folders: { input: string; id: string; name: string | null; error: string | null; files: number }[] = [];
  const all: DriveTreeFile[] = [];
  let truncated = false;
  for (const id of folderIds) {
    try {
      const t = await listFolderTree(o.eventId, id, o.recursive);
      truncated ||= t.truncated;
      folders.push({ input: id, id, name: t.rootName, error: null, files: t.files.length });
      for (const f of t.files) if (!all.some((x) => x.id === f.id)) all.push(f);
    } catch (err) {
      folders.push({ input: id, id, name: null, error: err instanceof DriveError ? err.code : "drive_unknown", files: 0 });
    }
  }
  const skipped = all.filter((f) => isGoogleNativeFile(f.mimeType)).map((f) => ({ name: f.name, folderPath: f.folderPath, mimeType: f.mimeType }));
  const files = all.filter((f) => !isGoogleNativeFile(f.mimeType));

  // Candidate fingerprints: the file's own, and for a PDF its split pages'.
  const pageOf = new Map<string, string>();
  for (const f of files) {
    if (!f.sha256Checksum) continue;
    if (f.mimeType === "application/pdf") for (const p of pageHashes(f.sha256Checksum, MAX_PAGES)) pageOf.set(p, f.sha256Checksum);
  }
  const hashes = [...new Set(files.flatMap((f) => (f.sha256Checksum ? [f.sha256Checksum] : [])))];
  const ids = files.map((f) => f.id);
  const names = [...new Set(files.filter((f) => /\.pdf$/i.test(f.name)).map((f) => f.name))];
  const orgBill = { event: { organizationId: event.organizationId } };
  const select = { id: true, eventId: true, status: true, merchantName: true, amountCzk: true, billDate: true, displayFilename: true, contentHash: true, driveSourceFileId: true, exportFilename: true, paymentChannel: true, paidToAuthor: true, payerAuthor: { select: { isOfficialAccount: true, payoutNeeded: true } }, event: { select: { name: true } } } as const;
  type B = Awaited<ReturnType<typeof prisma.bill.findMany<{ select: typeof select }>>>[number];
  const found = new Map<string, B>();
  const add = (rows: B[]) => rows.forEach((b) => found.set(b.id, b));
  for (const c of chunks(ids)) add(await prisma.bill.findMany({ where: { ...orgBill, driveSourceFileId: { in: c } }, select }));
  for (const c of chunks([...hashes, ...pageOf.keys()])) add(await prisma.bill.findMany({ where: { ...orgBill, contentHash: { in: c } }, select }));
  for (const c of chunks(names)) add(await prisma.bill.findMany({ where: { ...orgBill, exportFilename: { in: c } }, select }));
  const bills = [...found.values()];

  // Details only for events the user has Účtenky in; elsewhere just "used in another event".
  const access = new Map<string, boolean>();
  for (const e of new Set(bills.map((b) => b.eventId))) access.set(e, await hasModuleAccess(o.user, e, "bills"));
  const bankOn = new Set((await prisma.eventModule.findMany({ where: { eventId: { in: [...access.keys()] }, moduleKey: "bank", enabled: true }, select: { eventId: true } })).map((m) => m.eventId));
  const states = await getBillPaymentStates(bills.filter((b) => bankOn.has(b.eventId)));
  // The same content as a bill in several events.
  const eventsPerHash = new Map<string, Set<string>>();
  for (const c of chunks(bills.map((b) => b.contentHash))) {
    for (const b of await prisma.bill.findMany({ where: { ...orgBill, contentHash: { in: c } }, select: { contentHash: true, eventId: true } })) {
      eventsPerHash.set(b.contentHash, (eventsPerHash.get(b.contentHash) ?? new Set()).add(b.eventId));
    }
  }

  const matchFor = (b: B, via: MatchVia): FileMatch => {
    const accessible = access.get(b.eventId) ?? false;
    const base = { billId: b.id, eventId: b.eventId, eventName: b.event.name, accessible, via };
    if (!accessible) return base;
    return {
      ...base, status: b.status, merchant: b.merchantName, amountCzk: b.amountCzk === null ? null : Number(b.amountCzk), billDate: b.billDate?.toISOString().slice(0, 10) ?? null, displayFilename: b.displayFilename,
      paid: !needsPayout(b.payerAuthor) ? "none" : b.paidToAuthor ? "paid" : "unpaid",
      payment: bankOn.has(b.eventId) ? states.get(b.id)?.state ?? null : b.paymentChannel,
    };
  };
  const rows: CleanupRow[] = files.map((f) => {
    const m = new Map<string, FileMatch>();
    const put = (b: B, via: MatchVia) => { if (!m.has(b.id)) m.set(b.id, matchFor(b, via)); };
    for (const b of bills) {
      const via = matchVia(f, b, pageOf);
      if (via) put(b, via);
    }
    const matches = [...m.values()];
    return {
      fileId: f.id, name: f.name, folderId: f.folderId, folderPath: f.folderPath, size: f.size ?? null, modifiedTime: f.modifiedTime ?? null, link: f.webViewLink ?? null, mimeType: f.mimeType,
      matches,
      duplicateGroup: null, keeper: false,
      billInSeveralEvents: bills.some((b) => matches.some((x) => x.billId === b.id) && (eventsPerHash.get(b.contentHash)?.size ?? 0) > 1),
      proposed: matches.length ? "move" : "none",
    };
  });

  const shaOf = new Map(files.map((f) => [f.id, f.sha256Checksum]));
  markDuplicates(rows, (r) => shaOf.get(r.fileId));
  return { folders, rows, skipped, truncated };
}

export type CleanupAction = { fileId: string; folderId: string; action: "move" | "trash" };

/** Moves (to the target folder) or bins the chosen files, one at a time; a result per file. */
export async function applyCleanup(o: { eventId: string; actions: CleanupAction[]; targetFolderId: string | null }) {
  const results: { fileId: string; ok: boolean; error?: string }[] = [];
  for (const a of o.actions) {
    try {
      if (a.action === "move") {
        if (!o.targetFolderId) throw new DriveError("not_found_or_no_access", {});
        if (a.folderId === o.targetFolderId) {
          results.push({ fileId: a.fileId, ok: true });
          continue;
        }
        await moveDriveFile(o.eventId, a.fileId, a.folderId, o.targetFolderId);
      } else await trashDriveFile(o.eventId, a.fileId);
      results.push({ fileId: a.fileId, ok: true });
    } catch (err) {
      results.push({ fileId: a.fileId, ok: false, error: err instanceof DriveError ? err.code : "drive_unknown" });
    }
  }
  return results;
}
