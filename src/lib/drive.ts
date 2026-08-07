import { GoogleAuth, Impersonated } from "google-auth-library";
import { google } from "googleapis";

const DRIVE_SA_EMAIL = process.env.DRIVE_SERVICE_ACCOUNT_EMAIL;

const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
];

let cachedClient: Impersonated | null = null;

async function getImpersonatedClient(): Promise<Impersonated> {
  if (cachedClient) return cachedClient;

  if (!DRIVE_SA_EMAIL) {
    throw new Error("DRIVE_SERVICE_ACCOUNT_EMAIL is not set");
  }

  const sourceAuth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const sourceClient = await sourceAuth.getClient();

  cachedClient = new Impersonated({
    sourceClient,
    targetPrincipal: DRIVE_SA_EMAIL,
    lifetime: 3600,
    delegates: [],
    targetScopes: SCOPES,
  });

  return cachedClient;
}

export async function getDriveClient() {
  const auth = await getImpersonatedClient();
  // googleapis bundles its own internal copy of google-auth-library. Ours
  // (installed directly, for the Impersonated class) is structurally the
  // same but TypeScript treats them as distinct types because of a private
  // field. Safe, deliberate cast — no behavior difference at runtime.
  return google.drive({ version: "v3", auth: auth as any });
}

export async function getSheetsClient() {
  const auth = await getImpersonatedClient();
  return google.sheets({ version: "v4", auth: auth as any });
}

export function getDriveServiceAccountEmail(): string {
  return DRIVE_SA_EMAIL ?? "";
}

// ---- Folder / file listing ----

export interface DriveFolderEntry {
  id: string;
  name: string;
}

export interface DriveFileEntry {
  id: string;
  name: string;
  mimeType: string;
}

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const GOOGLE_NATIVE_MIME_PREFIX = "application/vnd.google-apps.";

async function listChildren(
  drive: Awaited<ReturnType<typeof getDriveClient>>,
  folderId: string
): Promise<DriveFileEntry[]> {
  const results: DriveFileEntry[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      pageSize: 200,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of res.data.files ?? []) {
      if (f.id && f.name && f.mimeType) {
        results.push({ id: f.id, name: f.name, mimeType: f.mimeType });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return results;
}

/** Subfolders directly inside the ingest folder — one expected per author. */
export async function listAuthorSubfolders(folderId: string): Promise<DriveFolderEntry[]> {
  const drive = await getDriveClient();
  const entries = await listChildren(drive, folderId);
  return entries
    .filter((e) => e.mimeType === FOLDER_MIME_TYPE)
    .map((e) => ({ id: e.id, name: e.name }));
}

/** Files directly inside an author subfolder (non-folder entries only). */
export async function listFilesInSubfolder(folderId: string): Promise<DriveFileEntry[]> {
  const drive = await getDriveClient();
  const entries = await listChildren(drive, folderId);
  return entries.filter((e) => e.mimeType !== FOLDER_MIME_TYPE);
}

/** True for native Google Docs/Sheets/Slides — not downloadable as raw receipt bytes. */
export function isGoogleNativeFile(mimeType: string): boolean {
  return mimeType.startsWith(GOOGLE_NATIVE_MIME_PREFIX);
}

/** Downloads a file's raw bytes. Check isGoogleNativeFile first — don't call this on a native Google file. */
export async function downloadFileBuffer(fileId: string): Promise<Buffer> {
  const drive = await getDriveClient();
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data as ArrayBuffer);
}
// ---- Export: upload + manifest sheet ----

import { Readable } from "stream";

export async function uploadFileToFolder(
  folderId: string,
  name: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const drive = await getDriveClient();
  const res = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id",
    supportsAllDrives: true,
  });
  if (!res.data.id) throw new Error("Drive upload returned no file id");
  return res.data.id;
}

export async function findFileInFolder(
  folderId: string,
  name: string,
  mimeType?: string
): Promise<DriveFileEntry | null> {
  const drive = await getDriveClient();
  const escapedName = name.replace(/'/g, "\\'");
  let q = `'${folderId}' in parents and name = '${escapedName}' and trashed = false`;
  if (mimeType) q += ` and mimeType = '${mimeType}'`;

  const res = await drive.files.list({
    q,
    fields: "files(id, name, mimeType)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const f = res.data.files?.[0];
  if (!f?.id || !f.name || !f.mimeType) return null;
  return { id: f.id, name: f.name, mimeType: f.mimeType };
}

const SHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";

/**
 * Finds an existing manifest Sheet by exact title in the export folder and
 * overwrites its contents, or creates a new one if none exists. Creation
 * goes through the Drive API with `parents` set directly — NOT
 * sheets.spreadsheets.create(), which always creates the file in the
 * service account's own "My Drive" and fails outright, since service
 * accounts without a Workspace license have zero storage quota of their
 * own. Creating with a parent folder set up front inherits quota from the
 * folder's owner instead — the standard workaround for this limitation.
 */
export async function createManifestSheet(
  exportFolderId: string,
  title: string,
  rows: (string | number)[][]
): Promise<string> {
  const drive = await getDriveClient();
  const created = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: SHEET_MIME_TYPE,
      parents: [exportFolderId],
    },
    fields: "id",
    supportsAllDrives: true,
  });
  if (!created.data.id) throw new Error("Drive create returned no file id for manifest sheet");
  const spreadsheetId = created.data.id;

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  });

  return spreadsheetId;
}

export async function writeManifestValues(
  spreadsheetId: string,
  rows: (string | number)[][]
): Promise<void> {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: "A1:Z10000" });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  });
}