import { GoogleAuth, Impersonated } from "google-auth-library";
import { google } from "googleapis";
import { Readable } from "stream";

const DRIVE_SA_EMAIL = process.env.DRIVE_SERVICE_ACCOUNT_EMAIL;

const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
];

const DRIVE_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries a Drive/Sheets operation up to MAX_ATTEMPTS times, each with its
 * own fresh timeout. `fn` is called fresh on every attempt — critical for
 * anything involving a stream body (see uploadFileToFolder), since a stream
 * consumed by a failed attempt can't be reused for the next one.
 */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await withTimeout(fn(), DRIVE_TIMEOUT_MS, label);
    } catch (err) {
      lastError = err;
      console.log(`[drive] ${label} attempt ${attempt}/${MAX_ATTEMPTS} failed:`, String(err));
      if (attempt < MAX_ATTEMPTS) await sleep(1000);
    }
  }
  throw lastError;
}

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
  return withRetry(async () => {
    const drive = await getDriveClient();
    const res = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" }
    );
    return Buffer.from(res.data as ArrayBuffer);
  }, `download file ${fileId}`);
}

// ---- Export: upload + manifest sheet ----

export async function uploadFileToFolder(
  folderId: string,
  name: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  return withRetry(async () => {
    const drive = await getDriveClient();
    const res = await drive.files.create({
      requestBody: { name, parents: [folderId] },
      // Built fresh on every attempt — a stream consumed by a failed
      // attempt can't be replayed for a retry.
      media: { mimeType, body: Readable.from(buffer) },
      fields: "id",
      supportsAllDrives: true,
    });
    if (!res.data.id) throw new Error("Drive upload returned no file id");
    return res.data.id;
  }, `upload file ${name}`);
}

export async function getOrCreateSubfolder(parentFolderId: string, name: string): Promise<string> {
  const existing = await findFileInFolder(parentFolderId, name, FOLDER_MIME_TYPE);
  if (existing) return existing.id;

  return withRetry(async () => {
    const drive = await getDriveClient();
    const res = await drive.files.create({
      requestBody: { name, mimeType: FOLDER_MIME_TYPE, parents: [parentFolderId] },
      fields: "id",
      supportsAllDrives: true,
    });
    if (!res.data.id) throw new Error("Drive folder create returned no file id");
    return res.data.id;
  }, `create subfolder ${name}`);
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
  const spreadsheetId = await withRetry(async () => {
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
    return created.data.id;
  }, `create manifest sheet ${title}`);

  await withRetry(async () => {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "A1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows },
    });
  }, `write manifest values ${spreadsheetId}`);

  return spreadsheetId;
}

export async function writeManifestValues(
  spreadsheetId: string,
  rows: (string | number)[][]
): Promise<void> {
  await withRetry(async () => {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: "A1:Z10000" });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "A1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows },
    });
  }, `write manifest values ${spreadsheetId}`);
}