// Self-check: npx tsx src/lib/drive-cleanup.check.ts
import assert from "node:assert/strict";
import crypto from "crypto";
import { markDuplicates, matchVia, pageHashes, type CleanupRow } from "@/lib/drive-cleanup";

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const pdf = sha("the pdf bytes");
// Same formula as src/lib/bill-ingest.ts for split pages.
assert.equal(pageHashes(pdf)[1], sha(`${pdf}:page:2`));
const pageOf = new Map(pageHashes(pdf).map((p) => [p, pdf]));
const file = { id: "F1", name: "a.pdf", sha256Checksum: pdf };
const bill = (o: Partial<{ driveSourceFileId: string | null; contentHash: string; exportFilename: string | null }>) => ({ driveSourceFileId: null, contentHash: "x", exportFilename: null, ...o });
assert.equal(matchVia(file, bill({ driveSourceFileId: "F1", contentHash: pdf }), pageOf), "drive_id", "the Drive link wins");
assert.equal(matchVia(file, bill({ contentHash: pdf }), pageOf), "content");
assert.equal(matchVia(file, bill({ contentHash: sha(`${pdf}:page:3`) }), pageOf), "page");
assert.equal(matchVia(file, bill({ exportFilename: "a.pdf" }), pageOf), "export_name");
assert.equal(matchVia(file, bill({}), pageOf), null);

const row = (id: string, modified: string, via: "drive_id" | "content" | "export_name" | null): CleanupRow => ({
  fileId: id, name: id, folderId: "D", folderPath: "D", size: 1, modifiedTime: modified, link: null, mimeType: "application/pdf",
  matches: via ? [{ billId: "b", eventId: "e", eventName: "E", accessible: true, via }] : [], duplicateGroup: null, keeper: false, billInSeveralEvents: false, proposed: via ? "move" : "none",
});
const rows = [row("old-unused", "2026-01-01", null), row("used", "2026-05-01", "content"), row("imported", "2026-06-01", "drive_id"), row("alone", "2026-01-01", null)];
markDuplicates(rows, (r) => (r.fileId === "alone" ? "other" : "same"));
const by = (id: string) => rows.find((r) => r.fileId === id)!;
assert.ok(by("imported").keeper && by("imported").proposed === "move", "the imported copy is kept");
assert.ok(!by("used").keeper && by("used").proposed === "trash");
assert.ok(!by("old-unused").keeper && by("old-unused").proposed === "trash");
assert.equal(by("alone").duplicateGroup, null, "a single file is no duplicate");
const two = [row("newer", "2026-03-01", null), row("older", "2026-02-01", null)];
markDuplicates(two, () => "h");
assert.ok(two.find((r) => r.fileId === "older")!.keeper, "no bill: the oldest copy is kept");

// Same name in one folder (bytes differ): the oldest stays, a copy a bill uses by content too.
const named = [
  { ...row("n-new", "2026-10-17", "export_name"), name: "001-00.pdf", folderId: "F" },
  { ...row("n-old", "2026-10-10", "export_name"), name: "001-00.pdf", folderId: "F" },
  { ...row("n-content", "2026-10-18", "content"), name: "001-00.pdf", folderId: "F" },
  { ...row("n-other-folder", "2026-10-19", null), name: "001-00.pdf", folderId: "G" },
];
markDuplicates(named, (r) => r.fileId);
const n = (id: string) => named.find((r) => r.fileId === id)!;
assert.ok(n("n-old").keeper && n("n-old").proposed !== "trash");
assert.equal(n("n-new").proposed, "trash");
assert.ok(n("n-content").keeper && n("n-content").proposed === "move", "a file a bill uses by content is never binned for its name");
assert.equal(n("n-other-folder").duplicateGroup, null, "another folder is no duplicate");
console.log("ok");
