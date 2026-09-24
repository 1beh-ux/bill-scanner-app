import { GoogleAuth, Impersonated } from "google-auth-library";
import { google } from "googleapis";
import { Readable } from "stream";
import { prisma } from "@/lib/prisma";
import { decryptMailToken } from "@/lib/mail-token-crypto";
import {
  DriveError,
  isTransientGoogleError,
  mapDriveError,
  type DriveErrorParams,
} from "@/lib/drive-errors";

const DRIVE_SA_EMAIL = process.env.DRIVE_SERVICE_ACCOUNT_EMAIL;

const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/documents",
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

// ---- Whose Google identity does an event use? ----------------------------------
//
// An event uses the connected Google account of the user who configured its Drive
// (Event.driveConfiguredByUserId) for ALL Drive/Sheets/Docs work -- interactive
// and background alike. No valid connection (never connected, token dead, user
// inactive) -> the service account, reported as a warning, never silently.

export type DriveIdentityWarning = "no_connection" | "token_invalid" | "user_inactive";

export type DriveIdentity = {
  kind: "user" | "service_account";
  /** Google account actually used (user's email, or the service account's). */
  email: string;
  serviceAccountEmail: string;
  /** Set when kind is "user". */
  accountId?: string;
  connectedAt?: Date;
  /** The user the event's Drive is configured by (may differ from who is logged in). */
  configuredBy?: { id: string; displayName: string } | null;
  /** Why the service account is used instead of a user's account. */
  warning?: DriveIdentityWarning;
};

const IDENTITY_TTL_MS = 20_000;
const identityCache = new Map<string, { at: number; identity: DriveIdentity }>();

/** Forget cached identities (after connect / disconnect / take-over / folder save). */
export function invalidateDriveIdentity(eventId?: string): void {
  if (eventId) identityCache.delete(eventId);
  else identityCache.clear();
}

export function getDriveServiceAccountEmail(): string {
  return DRIVE_SA_EMAIL ?? "";
}

export async function getDriveIdentity(eventId: string): Promise<DriveIdentity> {
  const cached = identityCache.get(eventId);
  if (cached && Date.now() - cached.at < IDENTITY_TTL_MS) return cached.identity;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      driveConfiguredBy: {
        select: {
          id: true,
          displayName: true,
          active: true,
          driveAccount: { select: { id: true, email: true, connectedAt: true, tokenInvalidAt: true } },
        },
      },
    },
  });

  const sa = getDriveServiceAccountEmail();
  const owner = event?.driveConfiguredBy ?? null;
  const base = { serviceAccountEmail: sa, configuredBy: owner ? { id: owner.id, displayName: owner.displayName } : null };

  let identity: DriveIdentity;
  if (!owner || !owner.driveAccount) {
    identity = { ...base, kind: "service_account", email: sa, warning: "no_connection" };
  } else if (!owner.active) {
    identity = { ...base, kind: "service_account", email: sa, warning: "user_inactive" };
  } else if (owner.driveAccount.tokenInvalidAt) {
    identity = { ...base, kind: "service_account", email: sa, warning: "token_invalid" };
  } else {
    identity = {
      ...base,
      kind: "user",
      email: owner.driveAccount.email,
      accountId: owner.driveAccount.id,
      connectedAt: owner.driveAccount.connectedAt,
    };
  }
  identityCache.set(eventId, { at: Date.now(), identity });
  return identity;
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

// One OAuth client per connected account (keyed by account id + connection time,
// so a reconnect gets a fresh client). Deliberately not a single global client.
const oauthClients = new Map<string, { connectedAtMs: number; client: InstanceType<typeof google.auth.OAuth2> }>();

async function getOAuthClientFor(accountId: string) {
  const account = await prisma.driveAccount.findUniqueOrThrow({ where: { id: accountId } });
  const hit = oauthClients.get(accountId);
  if (hit && hit.connectedAtMs === account.connectedAt.getTime()) return hit.client;
  const client = new google.auth.OAuth2(process.env.MAIL_OAUTH_CLIENT_ID, process.env.MAIL_OAUTH_CLIENT_SECRET);
  client.setCredentials({ refresh_token: decryptMailToken(account.refreshTokenEncrypted) });
  oauthClients.set(accountId, { connectedAtMs: account.connectedAt.getTime(), client });
  return client;
}

/** The resolved identity plus the auth object to talk to Google with. */
export async function resolveDriveAuth(eventId: string) {
  const identity = await getDriveIdentity(eventId);
  // googleapis bundles its own google-auth-library copy; ours (for the
  // Impersonated class) is structurally the same but typed as distinct --
  // safe, deliberate cast, no runtime difference.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auth = identity.kind === "user" ? await getOAuthClientFor(identity.accountId!) : ((await getImpersonatedClient()) as any);
  return { identity, auth };
}

/** True when a connected user account (not the service account) does this event's Drive work. */
export async function usingConnectedDriveAccount(eventId: string): Promise<boolean> {
  return (await getDriveIdentity(eventId)).kind === "user";
}

export async function getDriveClient(eventId: string) {
  const { auth } = await resolveDriveAuth(eventId);
  return google.drive({ version: "v3", auth });
}

export async function getSheetsClient(eventId: string) {
  const { auth } = await resolveDriveAuth(eventId);
  return google.sheets({ version: "v4", auth });
}

export async function getDocsClient(eventId: string) {
  const { auth } = await resolveDriveAuth(eventId);
  return google.docs({ version: "v1", auth });
}

/**
 * Maps a Google failure to a DriveError with the event's identity filled in, and
 * records a dead refresh token so the next resolution falls back to the service
 * account with a warning. Use around any direct Drive/Docs/Sheets calls.
 */
export async function toDriveError(
  eventId: string,
  err: unknown,
  ctx: Omit<DriveErrorParams, "identity" | "identityKind" | "serviceAccount"> & { purpose?: "read" | "write" } = {}
): Promise<DriveError> {
  if (err instanceof DriveError) return err;
  const identity = await getDriveIdentity(eventId).catch(() => null);
  const mapped = mapDriveError(err, {
    ...ctx,
    identity: identity?.email,
    identityKind: identity?.kind,
    serviceAccount: getDriveServiceAccountEmail(),
  });
  if (mapped.code === "token_invalid" && identity?.kind === "user" && identity.accountId) {
    await prisma.driveAccount
      .update({ where: { id: identity.accountId }, data: { tokenInvalidAt: new Date() } })
      .catch(() => {});
    invalidateDriveIdentity(eventId);
  }
  return mapped;
}

/**
 * Runs a Drive/Sheets operation with a fresh timeout per attempt. Only
 * transient failures (429 / 5xx / network / our timeout) are retried; anything
 * else -- 404, 403, dead token -- fails immediately as a mapped DriveError.
 * `fn` is called fresh on every attempt: critical for stream bodies (see
 * uploadFileToFolder), a stream consumed by a failed attempt can't be replayed.
 */
async function withRetry<T>(
  eventId: string,
  fn: () => Promise<T>,
  label: string,
  ctx: Omit<DriveErrorParams, "identity" | "identityKind" | "serviceAccount"> & { purpose?: "read" | "write" } = {}
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await withTimeout(fn(), DRIVE_TIMEOUT_MS, label);
    } catch (err) {
      lastError = err;
      console.log(`[drive] ${label} attempt ${attempt}/${MAX_ATTEMPTS} failed:`, String(err));
      if (!isTransientGoogleError(err) || attempt === MAX_ATTEMPTS) break;
      await sleep(1000);
    }
  }
  throw await toDriveError(eventId, lastError, ctx);
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

/** Which of the event's folders an operation targets (only used to word error messages). */
export type DriveFolderLabel = "ingest" | "export" | "participants";

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

/** Subfolders directly inside the ingest folder — one expected per payer. */
export async function listAuthorSubfolders(eventId: string, folderId: string, label?: DriveFolderLabel): Promise<DriveFolderEntry[]> {
  return withRetry(
    eventId,
    async () => {
      const drive = await getDriveClient(eventId);
      const entries = await listChildren(drive, folderId);
      return entries.filter((e) => e.mimeType === FOLDER_MIME_TYPE).map((e) => ({ id: e.id, name: e.name }));
    },
    `list subfolders of ${folderId}`,
    { folderId, folderLabel: label, purpose: "read" }
  );
}

/** Files directly inside a folder (non-folder entries only). */
export async function listFilesInSubfolder(eventId: string, folderId: string, label?: DriveFolderLabel): Promise<DriveFileEntry[]> {
  return withRetry(
    eventId,
    async () => {
      const drive = await getDriveClient(eventId);
      const entries = await listChildren(drive, folderId);
      return entries.filter((e) => e.mimeType !== FOLDER_MIME_TYPE);
    },
    `list files of ${folderId}`,
    { folderId, folderLabel: label, purpose: "read" }
  );
}

/** True for native Google Docs/Sheets/Slides — not downloadable as raw receipt bytes. */
export function isGoogleNativeFile(mimeType: string): boolean {
  return mimeType.startsWith(GOOGLE_NATIVE_MIME_PREFIX);
}

/** Downloads a file's raw bytes. Check isGoogleNativeFile first — don't call this on a native Google file. */
export async function downloadFileBuffer(eventId: string, fileId: string): Promise<Buffer> {
  return withRetry(
    eventId,
    async () => {
      const drive = await getDriveClient(eventId);
      const res = await drive.files.get(
        { fileId, alt: "media", supportsAllDrives: true },
        { responseType: "arraybuffer" }
      );
      return Buffer.from(res.data as ArrayBuffer);
    },
    `download file ${fileId}`,
    { purpose: "read" }
  );
}

// ---- Export: upload + manifest sheet ----

export async function uploadFileToFolder(
  eventId: string,
  folderId: string,
  name: string,
  buffer: Buffer,
  mimeType: string,
  label?: DriveFolderLabel
): Promise<string> {
  return withRetry(
    eventId,
    async () => {
      const drive = await getDriveClient(eventId);
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
    },
    `upload file ${name}`,
    { folderId, folderLabel: label, purpose: "write" }
  );
}

/** Replaces a file's content in place (same Drive file id, so links keep working). */
export async function updateFileContent(eventId: string, fileId: string, buffer: Buffer, mimeType: string): Promise<void> {
  await withRetry(
    eventId,
    async () => {
      const drive = await getDriveClient(eventId);
      await drive.files.update({
        fileId,
        media: { mimeType, body: Readable.from(buffer) },
        supportsAllDrives: true,
      });
    },
    `update file ${fileId}`,
    { purpose: "write" }
  );
}

export async function getOrCreateSubfolder(eventId: string, parentFolderId: string, name: string, label?: DriveFolderLabel): Promise<string> {
  const existing = await findFileInFolder(eventId, parentFolderId, name, FOLDER_MIME_TYPE, label);
  if (existing) return existing.id;

  return withRetry(
    eventId,
    async () => {
      const drive = await getDriveClient(eventId);
      const res = await drive.files.create({
        requestBody: { name, mimeType: FOLDER_MIME_TYPE, parents: [parentFolderId] },
        fields: "id",
        supportsAllDrives: true,
      });
      if (!res.data.id) throw new Error("Drive folder create returned no file id");
      return res.data.id;
    },
    `create subfolder ${name}`,
    { folderId: parentFolderId, folderLabel: label, purpose: "write" }
  );
}

export async function findFileInFolder(
  eventId: string,
  folderId: string,
  name: string,
  mimeType?: string,
  label?: DriveFolderLabel
): Promise<DriveFileEntry | null> {
  return withRetry(
    eventId,
    async () => {
      const drive = await getDriveClient(eventId);
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
    },
    `find ${name}`,
    { folderId, folderLabel: label, purpose: "read" }
  );
}

const SHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";

/**
 * Creates the manifest Sheet in the export folder and fills it. Creation goes
 * through the Drive API with `parents` set directly — NOT
 * sheets.spreadsheets.create(), which always creates the file in the
 * acting account's own "My Drive" root instead of the export folder.
 */
export async function createManifestSheet(
  eventId: string,
  exportFolderId: string,
  title: string,
  rows: (string | number)[][]
): Promise<string> {
  const spreadsheetId = await withRetry(
    eventId,
    async () => {
      const drive = await getDriveClient(eventId);
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
    },
    `create manifest sheet ${title}`,
    { folderId: exportFolderId, folderLabel: "export", purpose: "write" }
  );

  await withRetry(
    eventId,
    async () => {
      const sheets = await getSheetsClient(eventId);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "A1",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: rows },
      });
    },
    `write manifest values ${spreadsheetId}`,
    { purpose: "write" }
  );

  return spreadsheetId;
}

/**
 * Reads a Sheet's raw cell values by spreadsheet ID (the id in the Sheets URL,
 * not a Drive file). The Sheet must be shared with the identity the event uses
 * (getDriveIdentity(eventId).email) or this fails with not_found_or_no_access.
 */
export async function readSheetValues(eventId: string, spreadsheetId: string, range = "A1:ZZ2000"): Promise<string[][]> {
  return withRetry(
    eventId,
    async () => {
      const sheets = await getSheetsClient(eventId);
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      return (res.data.values ?? []).map((row) => row.map((cell) => String(cell ?? "")));
    },
    `read sheet values ${spreadsheetId}`,
    { purpose: "read" }
  );
}

/** Tab (sheet) titles of a spreadsheet, in order. Same sharing requirement as readSheetValues. */
export async function listSheetTabs(eventId: string, spreadsheetId: string): Promise<string[]> {
  return withRetry(
    eventId,
    async () => {
      const sheets = await getSheetsClient(eventId);
      const res = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
      return (res.data.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);
    },
    `list sheet tabs ${spreadsheetId}`,
    { purpose: "read" }
  );
}

export async function writeManifestValues(
  eventId: string,
  spreadsheetId: string,
  rows: (string | number)[][],
  // Wide enough for every column the manifest can have (Part 14 adds one pair
  // per category); the clear range must cover the widest run ever written.
  clearRange = "A1:ZZ10000"
): Promise<void> {
  await withRetry(
    eventId,
    async () => {
      const sheets = await getSheetsClient(eventId);
      await sheets.spreadsheets.values.clear({ spreadsheetId, range: clearRange });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "A1",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: rows },
      });
    },
    `write manifest values ${spreadsheetId}`,
    { purpose: "write" }
  );
}

// ---- Folder diagnostics ("Otestovat připojení") ----

export type FolderTestResult =
  | { ok: true; folderId: string; name: string; canWrite: boolean; inSharedDrive: boolean }
  | { ok: false; folderId: string; error: DriveError };

/**
 * Checks one folder with the event's identity. `need: "write"` additionally
 * requires that files can be created there (export/participants folders) and
 * predicts the service-account quota failure before an upload fails with it.
 */
export async function testFolder(
  eventId: string,
  folderId: string,
  need: "read" | "write",
  label: DriveFolderLabel
): Promise<FolderTestResult> {
  const identity = await getDriveIdentity(eventId);
  const params = {
    identity: identity.email,
    identityKind: identity.kind,
    serviceAccount: identity.serviceAccountEmail,
    folderId,
    folderLabel: label,
  };
  try {
    const res = await withRetry(
      eventId,
      async () => {
        const drive = await getDriveClient(eventId);
        return drive.files.get({
          fileId: folderId,
          fields: "id, name, mimeType, driveId, capabilities(canAddChildren)",
          supportsAllDrives: true,
        });
      },
      `test folder ${folderId}`,
      { folderId, folderLabel: label, purpose: "read" }
    );
    if (res.data.mimeType !== FOLDER_MIME_TYPE) return { ok: false, folderId, error: new DriveError("is_a_file", params) };
    const inSharedDrive = !!res.data.driveId;
    const canWrite = res.data.capabilities?.canAddChildren === true;
    if (need === "write") {
      // A service account can never store files in a personal (My Drive) folder.
      if (identity.kind === "service_account" && !inSharedDrive) {
        return { ok: false, folderId, error: new DriveError("service_account_no_quota", params) };
      }
      if (!canWrite) return { ok: false, folderId, error: new DriveError("read_only_access", params) };
    }
    return { ok: true, folderId, name: res.data.name ?? "", canWrite, inSharedDrive };
  } catch (err) {
    return { ok: false, folderId, error: err instanceof DriveError ? err : await toDriveError(eventId, err, { folderId, folderLabel: label }) };
  }
}
