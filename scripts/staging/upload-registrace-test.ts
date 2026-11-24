// Use-case test "Registrace 2027" (STAGING DRIVE ONLY, approved by the owner 2026-11-24): uploads the test package
// from docs/test-cases/registrace-2027 into "Táborník STAGING / Registrace 2027 – test" as the staging Drive account:
// the member list (CSV + a Google Sheet copy), the 9 registration-list PDFs, the README. Re-running replaces the
// files in that folder (same names). Invented data only. Prints names + links.
//   npx tsx scripts/staging/upload-registrace-test.ts
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { google } from "googleapis";

const SA = "bill-scanner-drive-staging@prvni-beh-filesaver.iam.gserviceaccount.com";
const FOLDER = "application/vnd.google-apps.folder";
const SRC = "docs/test-cases/registrace-2027";

async function main() {
  const token = execFileSync("gcloud", ["auth", "print-access-token", `--impersonate-service-account=${SA}`, "--scopes=https://www.googleapis.com/auth/drive"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  const drive = google.drive({ version: "v3", auth });
  const all = { supportsAllDrives: true, includeItemsFromAllDrives: true };
  const nameRe = /^T[aá]born[ií]k STAGING$/;
  const sd = ((await drive.drives.list({ pageSize: 50 })).data.drives ?? []).find((d) => nameRe.test(d.name ?? ""));
  const shared = sd ? null : ((await drive.files.list({ ...all, q: `sharedWithMe and mimeType = '${FOLDER}' and trashed = false`, fields: "files(id,name)" })).data.files ?? []).find((f) => nameRe.test(f.name ?? ""));
  const root = sd?.id ?? shared?.id;
  if (!root) throw new Error(`the folder "Táborník STAGING" is not visible to ${SA}`);

  const find = async (name: string, parent: string, mime?: string) =>
    ((await drive.files.list({ ...all, q: `name = '${name.replace(/'/g, "\\'")}' and '${parent}' in parents and trashed = false${mime ? ` and mimeType = '${mime}'` : ""}`, fields: "files(id)" })).data.files ?? [])[0]?.id ?? null;
  const folder = async (name: string, parent: string) =>
    (await find(name, parent, FOLDER)) ?? (await drive.files.create({ supportsAllDrives: true, requestBody: { name, mimeType: FOLDER, parents: [parent] }, fields: "id" })).data.id!;
  const put = async (file: string, parent: string, mimeType: string, asMime?: string, name = path.basename(file)) => {
    const media = { mimeType, body: Readable.from(fs.readFileSync(file)) };
    const old = await find(name, parent);
    const res = old
      ? await drive.files.update({ supportsAllDrives: true, fileId: old, media, fields: "id,webViewLink" })
      : await drive.files.create({ supportsAllDrives: true, requestBody: { name, parents: [parent], ...(asMime && { mimeType: asMime }) }, media, fields: "id,webViewLink" });
    return { name, link: res.data.webViewLink };
  };

  const top = await folder("Registrace 2027 – test", root);
  const pdfDir = await folder("Registrační listy (PDF)", top);
  const out = [
    await put(`${SRC}/clenove-2026.csv`, top, "text/csv"),
    await put(`${SRC}/clenove-2026.csv`, top, "text/csv", "application/vnd.google-apps.spreadsheet", "Členové 2026 (test)"),
    await put(`${SRC}/README.md`, top, "text/markdown", undefined, "README – testovací scénář.md"),
  ];
  for (const f of fs.readdirSync(`${SRC}/pdf`).filter((x) => x.endsWith(".pdf")).sort()) out.push(await put(`${SRC}/pdf/${f}`, pdfDir, "application/pdf"));
  const folderLink = (await drive.files.get({ supportsAllDrives: true, fileId: top, fields: "webViewLink" })).data.webViewLink;
  console.log(JSON.stringify({ folder: folderLink, files: out }, null, 1));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
export {};
