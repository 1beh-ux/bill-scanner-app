// Scripted checks for the per-user Google account + Drive error codes
// (docs/drive-payers-roles-change-notes.md, Part 4). The Google client is
// replaced by a fake, so nothing touches Google; the LOCAL database is used.
//
//   npx tsx scripts/verify-drive.ts
import { config } from "dotenv";
config({ path: ".env" });
import crypto from "crypto";

if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "")) {
  console.error("Refusing to run: DATABASE_URL is not local.");
  process.exit(1);
}
// Env the Drive layer reads at import time.
process.env.MAIL_TOKEN_ENC_KEY = crypto.randomBytes(32).toString("base64");
process.env.DRIVE_SERVICE_ACCOUNT_EMAIL = "sa@test.iam.gserviceaccount.com";
process.env.MAIL_OAUTH_CLIENT_ID = "test-client";
process.env.MAIL_OAUTH_CLIENT_SECRET = "test-secret";

// -- fake Google ---------------------------------------------------------------
type FakeErr = { code?: number; message?: string; errors?: { reason: string }[] };
const fakeFiles: Record<string, { mimeType: string; name: string; driveId?: string; canAddChildren: boolean } | FakeErr> = {
  FOLDER_SHARED_OK: { mimeType: "application/vnd.google-apps.folder", name: "Shared ok", driveId: "SD1", canAddChildren: true },
  FOLDER_MYDRIVE_OK: { mimeType: "application/vnd.google-apps.folder", name: "My drive ok", canAddChildren: true },
  FOLDER_READONLY: { mimeType: "application/vnd.google-apps.folder", name: "Read only", driveId: "SD1", canAddChildren: false },
  A_FILE_NOT_FOLDER: { mimeType: "application/pdf", name: "x.pdf", canAddChildren: false },
  MISSING_FOLDER_ID: { code: 404, message: "File not found: MISSING_FOLDER_ID." },
  RATE_LIMITED_ID: { code: 429, message: "Rate Limit Exceeded" },
  DRIVE_DOWN_ID: { code: 503, message: "Backend Error" },
  DEAD_TOKEN_ID: { code: 400, message: "invalid_grant" },
};
let currentUser: import("../src/generated/prisma").User | null = null;
let sheetsClearError: FakeErr | null = null;
const createdSheets: string[] = [];
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module");
const origLoad = Module._load;
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === "@/lib/auth") return { getCurrentUser: async () => currentUser };
  const real = origLoad.apply(this, [request, parent, isMain]);
  if (request !== "googleapis") return real;
  const fakeGoogle = Object.create(real.google);
  fakeGoogle.drive = () => ({
    files: {
      get: async ({ fileId }: { fileId: string }) => {
        const f = fakeFiles[fileId] as ({ name: string; mimeType: string; driveId?: string; canAddChildren: boolean } & FakeErr) | undefined;
        if (!f) throw { code: 404, message: `File not found: ${fileId}.` };
        if (f.code) throw f;
        return { data: { id: fileId, name: f.name, mimeType: f.mimeType, driveId: f.driveId, capabilities: { canAddChildren: f.canAddChildren } } };
      },
      create: async () => {
        const id = `sheet-${createdSheets.length + 1}`;
        createdSheets.push(id);
        return { data: { id } };
      },
    },
  });
  fakeGoogle.sheets = () => ({
    spreadsheets: {
      values: {
        clear: async () => {
          if (sheetsClearError) throw sheetsClearError;
        },
        update: async () => ({}),
      },
    },
  });
  return { ...real, google: fakeGoogle };
};

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${!ok && detail ? `  -> ${detail}` : ""}`);
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { encryptMailToken } = await import("../src/lib/mail-token-crypto");
  const drive = await import("../src/lib/drive");
  const errors = await import("../src/lib/drive-errors");
  const { upsertManifest } = await import("../src/lib/drive-export");

  console.log("== error mapping (Google error -> stable code)");
  const map = (err: unknown, ctx: Parameters<typeof errors.mapDriveError>[1] = {}) => errors.mapDriveError(err, ctx).code;
  check("invalid_grant -> token_invalid", map({ message: "invalid_grant", code: 400 }) === "token_invalid");
  check("401 -> token_invalid", map({ code: 401, message: "Unauthorized" }) === "token_invalid");
  check("404 -> not_found_or_no_access", map({ code: 404, message: "File not found" }) === "not_found_or_no_access");
  check("403 while reading -> not_found_or_no_access", map({ code: 403, message: "no" }, { purpose: "read" }) === "not_found_or_no_access");
  check("403 while writing -> read_only_access", map({ code: 403, message: "The user does not have sufficient permissions" }, { purpose: "write" }) === "read_only_access");
  check("service account quota -> service_account_no_quota", map({ code: 403, message: "Service Accounts do not have storage quota." }, { purpose: "write" }) === "service_account_no_quota");
  check("user quota exceeded (user account) -> storage_quota_exceeded", map({ code: 403, message: "The user's Drive storage quota has been exceeded." }, { identityKind: "user" }) === "storage_quota_exceeded");
  check("429 -> drive_rate_limited", map({ code: 429, message: "Rate limit" }) === "drive_rate_limited");
  check("403 rateLimitExceeded -> drive_rate_limited", map({ code: 403, message: "x", errors: [{ reason: "userRateLimitExceeded" }] }) === "drive_rate_limited");
  check("503 -> drive_unavailable", map({ code: 503, message: "Backend Error" }) === "drive_unavailable");
  check("network reset -> drive_unavailable", map({ code: "ECONNRESET", message: "socket hang up" }) === "drive_unavailable");
  check("our own timeout -> drive_unavailable", map(new Error("upload file x timed out after 60000ms")) === "drive_unavailable");
  check("unknown failure -> drive_unknown (not a crash)", map({ code: 418, message: "teapot" }) === "drive_unknown");
  check("transient = 429/5xx/network only", errors.isTransientGoogleError({ code: 429 }) && errors.isTransientGoogleError({ code: 500 }) && !errors.isTransientGoogleError({ code: 404 }) && !errors.isTransientGoogleError({ message: "invalid_grant" }) && !errors.isTransientGoogleError({ code: 403, message: "nope" }));

  console.log("\n== folder ids");
  const P = errors.parseFolderId;
  const ID = "1QMVYDpgjzDc9myMaUzZNWvtrbB-WYkZj";
  check("bare id accepted", P(ID) === ID);
  check("folder URL -> id", P(`https://drive.google.com/drive/folders/${ID}`) === ID);
  check("folder URL with account + query -> id", P(`https://drive.google.com/drive/u/0/folders/${ID}?usp=sharing`) === ID);
  check("?id= URL -> id", P(`https://drive.google.com/open?id=${ID}`) === ID);
  check("surrounding whitespace ignored", P(`  ${ID}\n`) === ID);
  check("garbage -> null (not_a_folder_id)", P("nejaky text s mezerami") === null && P("abc") === null && P("") === null && P("https://example.com/x") === null);

  console.log("\n== identity: each user has their own Google account");
  const run = Date.now().toString(36);
  const mkUser = (email: string, active = true) =>
    prisma.user.upsert({ where: { email }, update: { active }, create: { email, displayName: email.split("@")[0], role: "user", active } });
  const u1 = await mkUser(`d-u1-${run}@test.local`);
  const u2 = await mkUser(`d-u2-${run}@test.local`);
  const ev = await prisma.event.create({ data: { name: `Drive ${run}`, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-10"), driveConfiguredByUserId: u1.id } });
  const ev2 = await prisma.event.create({ data: { name: `Drive2 ${run}`, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-10") } });

  let id = await drive.getDriveIdentity(ev.id);
  check("event configured by a user without a connection -> service account, warning no_connection", id.kind === "service_account" && id.warning === "no_connection" && id.email === "sa@test.iam.gserviceaccount.com");
  const acc1 = await prisma.driveAccount.create({ data: { email: `g1-${run}@gmail.test`, refreshTokenEncrypted: encryptMailToken("REFRESH-1"), connectedByUserId: u1.id } });
  drive.invalidateDriveIdentity();
  id = await drive.getDriveIdentity(ev.id);
  check("after user 1 connects -> identity is user 1's Google account", id.kind === "user" && id.email === acc1.email && id.configuredBy?.id === u1.id);

  const acc2 = await prisma.driveAccount.create({ data: { email: `g2-${run}@gmail.test`, refreshTokenEncrypted: encryptMailToken("REFRESH-2"), connectedByUserId: u2.id } });
  drive.invalidateDriveIdentity();
  id = await drive.getDriveIdentity(ev.id);
  check("user 2 connecting theirs does NOT change an event configured by user 1", id.kind === "user" && id.email === acc1.email);
  const auth1 = (await drive.resolveDriveAuth(ev.id)).auth as { credentials: { refresh_token?: string } };
  check("the OAuth client uses user 1's refresh token (not user 2's)", auth1.credentials.refresh_token === "REFRESH-1", String(auth1.credentials.refresh_token));
  await prisma.event.update({ where: { id: ev2.id }, data: { driveConfiguredByUserId: u2.id } });
  drive.invalidateDriveIdentity();
  const auth2 = (await drive.resolveDriveAuth(ev2.id)).auth as { credentials: { refresh_token?: string } };
  check("an event configured by user 2 uses user 2's account", (await drive.getDriveIdentity(ev2.id)).email === acc2.email && auth2.credentials.refresh_token === "REFRESH-2");
  let dup = false;
  try {
    await prisma.driveAccount.create({ data: { email: `other-${run}@gmail.test`, refreshTokenEncrypted: "x", connectedByUserId: u1.id } });
  } catch {
    dup = true;
  }
  check("a user can hold at most one connection (unique)", dup);

  console.log("\n== fallback to the service account (each reason)");
  await prisma.driveAccount.update({ where: { id: acc1.id }, data: { tokenInvalidAt: new Date() } });
  drive.invalidateDriveIdentity();
  id = await drive.getDriveIdentity(ev.id);
  check("dead token -> service account + warning token_invalid", id.kind === "service_account" && id.warning === "token_invalid");
  check("user 2's event is unaffected by user 1's dead token", (await drive.getDriveIdentity(ev2.id)).kind === "user");
  await prisma.driveAccount.update({ where: { id: acc1.id }, data: { tokenInvalidAt: null } });
  await prisma.user.update({ where: { id: u1.id }, data: { active: false } });
  drive.invalidateDriveIdentity();
  id = await drive.getDriveIdentity(ev.id);
  check("configuring user inactive -> service account + warning user_inactive", id.kind === "service_account" && id.warning === "user_inactive");
  await prisma.user.update({ where: { id: u1.id }, data: { active: true } });
  await prisma.driveAccount.delete({ where: { id: acc1.id } });
  drive.invalidateDriveIdentity();
  id = await drive.getDriveIdentity(ev.id);
  check("user 1 disconnects -> service account + no_connection; user 2 still fine", id.kind === "service_account" && id.warning === "no_connection" && (await drive.getDriveIdentity(ev2.id)).kind === "user");
  await prisma.event.update({ where: { id: ev.id }, data: { driveConfiguredByUserId: null } });
  drive.invalidateDriveIdentity();
  check("event with no configuring user -> service account", (await drive.getDriveIdentity(ev.id)).kind === "service_account");

  console.log("\n== dead token detected at runtime is remembered");
  const acc3 = await prisma.driveAccount.create({ data: { email: `g3-${run}@gmail.test`, refreshTokenEncrypted: encryptMailToken("REFRESH-3"), connectedByUserId: u1.id } });
  await prisma.event.update({ where: { id: ev.id }, data: { driveConfiguredByUserId: u1.id } });
  drive.invalidateDriveIdentity();
  const res = await drive.testFolder(ev.id, "DEAD_TOKEN_ID", "read", "ingest");
  check("Google says invalid_grant -> token_invalid", !res.ok && res.error.code === "token_invalid");
  const after = await prisma.driveAccount.findUniqueOrThrow({ where: { id: acc3.id } });
  check("the account is marked invalid, next resolution falls back with a warning", !!after.tokenInvalidAt && (await drive.getDriveIdentity(ev.id)).warning === "token_invalid");
  await prisma.driveAccount.update({ where: { id: acc3.id }, data: { tokenInvalidAt: null } });
  drive.invalidateDriveIdentity();

  console.log("\n== folder test with the fake Google client");
  const userEv = ev.id; // user identity (acc3)
  let t = await drive.testFolder(userEv, "FOLDER_SHARED_OK", "write", "export");
  check("writable shared-drive folder -> ok", t.ok && t.name === "Shared ok");
  t = await drive.testFolder(userEv, "FOLDER_MYDRIVE_OK", "write", "export");
  check("user identity + writable My Drive folder -> ok", t.ok);
  t = await drive.testFolder(userEv, "FOLDER_READONLY", "write", "export");
  check("readable but not writable -> read_only_access", !t.ok && t.error.code === "read_only_access");
  t = await drive.testFolder(userEv, "FOLDER_READONLY", "read", "ingest");
  check("the same folder is fine for the read-only ingest role", t.ok);
  t = await drive.testFolder(userEv, "A_FILE_NOT_FOLDER", "read", "ingest");
  check("id of a file -> is_a_file", !t.ok && t.error.code === "is_a_file");
  t = await drive.testFolder(userEv, "MISSING_FOLDER_ID", "read", "ingest");
  check("404 -> not_found_or_no_access, message carries the identity", !t.ok && t.error.code === "not_found_or_no_access" && t.error.params.identity === `g3-${run}@gmail.test` && t.error.params.folderLabel === "ingest");
  t = await drive.testFolder(userEv, "RATE_LIMITED_ID", "read", "ingest");
  check("429 (after retries) -> drive_rate_limited", !t.ok && t.error.code === "drive_rate_limited");
  t = await drive.testFolder(userEv, "DRIVE_DOWN_ID", "read", "ingest");
  check("503 (after retries) -> drive_unavailable", !t.ok && t.error.code === "drive_unavailable");
  t = await drive.testFolder(ev2.id, "FOLDER_MYDRIVE_OK", "write", "export"); // ev2 is user 2's -> still a user identity
  check("second user's event tests with its own identity", t.ok);
  await prisma.event.update({ where: { id: ev.id }, data: { driveConfiguredByUserId: null } });
  drive.invalidateDriveIdentity();
  t = await drive.testFolder(ev.id, "FOLDER_MYDRIVE_OK", "write", "export");
  check("service account + personal (My Drive) folder for writing -> service_account_no_quota", !t.ok && t.error.code === "service_account_no_quota" && t.error.params.serviceAccount === "sa@test.iam.gserviceaccount.com");
  t = await drive.testFolder(ev.id, "FOLDER_SHARED_OK", "write", "export");
  check("service account + Shared Drive folder -> ok", t.ok);
  t = await drive.testFolder(ev.id, "FOLDER_MYDRIVE_OK", "read", "ingest");
  check("service account can still READ a personal folder (ingest)", t.ok);

  console.log("\n== manifest sheet deleted");
  drive.invalidateDriveIdentity();
  await prisma.event.update({ where: { id: ev.id }, data: { driveConfiguredByUserId: u1.id } });
  sheetsClearError = { code: 404, message: "Requested entity was not found." };
  let code = "";
  try {
    await upsertManifest(ev.id, { exportFolderId: "FOLDER_SHARED_OK", cachedSpreadsheetId: "old-sheet", title: "M", rows: [["a"]], recreate: false });
  } catch (e) {
    code = (e as { code?: string }).code ?? "";
  }
  check("remembered manifest gone -> manifest_missing (not silently recreated)", code === "manifest_missing" && createdSheets.length === 0, `${code} created=${createdSheets.length}`);
  const newId = await upsertManifest(ev.id, { exportFolderId: "FOLDER_SHARED_OK", cachedSpreadsheetId: "old-sheet", title: "M", rows: [["a"]], recreate: true });
  check("after confirming, a new manifest is created", newId === "sheet-1" && createdSheets.length === 1, newId);
  sheetsClearError = null;
  const same = await upsertManifest(ev.id, { exportFolderId: "FOLDER_SHARED_OK", cachedSpreadsheetId: "old-sheet", title: "M", rows: [["a"]], recreate: false });
  check("healthy remembered manifest is just updated", same === "old-sheet");

  console.log("\n== routes: connection test, identity, folder input");
  const { NextRequest } = await import("next/server");
  const testRoute = await import("../src/app/api/events/[id]/drive-test/route");
  const identityRoute = await import("../src/app/api/events/[id]/drive-identity/route");
  const patchRoute = await import("../src/app/api/events/[id]/route");
  await prisma.userEventModuleAccess.createMany({ data: [u1, u2].map((u) => ({ userId: u.id, eventId: ev.id, moduleKey: "bills" as const })), skipDuplicates: true });
  await prisma.event.update({ where: { id: ev.id }, data: { driveConfiguredByUserId: u1.id } });
  drive.invalidateDriveIdentity();
  const post = async (h: (r: InstanceType<typeof NextRequest>, c: { params: Promise<{ id: string }> }) => Promise<Response>, user: typeof u1, body: unknown, method = "POST") => {
    currentUser = user;
    const res = await h(new NextRequest("http://localhost/x", { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ id: ev.id }) });
    return { status: res.status, json: await res.json() };
  };
  let r = await post(testRoute.POST, u2, { ingestFolderId: "FOLDER_SHARED_OK", exportFolderId: "FOLDER_SHARED_OK", participantsFolderId: "not a folder id!!" });
  check("test: ingest == export -> warning same_folder", r.json.warnings.includes("same_folder"), JSON.stringify(r.json.warnings));
  check("test: garbage input -> not_a_folder_id for that folder only", r.json.results.participants?.error === "not_a_folder_id" && r.json.results.ingest?.ok === true && r.json.results.export?.ok === true);
  check("test: reports the identity used (user 1's account, even though user 2 clicked)", r.json.identity.email === `g3-${run}@gmail.test`);
  r = await post(testRoute.POST, u2, { ingestFolderId: `https://drive.google.com/drive/folders/${ID}`, exportFolderId: "FOLDER_READONLY" });
  check("test: a pasted URL is resolved to its id and tested", r.json.results.ingest?.folderId === ID && r.json.results.ingest?.error === "not_found_or_no_access");
  check("test: read-only export folder reported per folder (not a generic failure)", r.json.results.export?.error === "read_only_access");
  currentUser = u2;
  const idRes = await (await identityRoute.GET(new NextRequest("http://localhost/x"), { params: Promise.resolve({ id: ev.id }) })).json();
  check("identity endpoint: shows who configured the event and that the caller is not them", idRes.identity.configuredBy?.id === u1.id && idRes.isConfiguredByMe === false && idRes.me.connected === true);
  r = await post(patchRoute.PATCH, u2, { driveExportFolderId: "totally not an id" }, "PATCH");
  check("saving garbage as a folder is rejected (not_a_folder_id, names the field)", r.status === 400 && r.json.error === "not_a_folder_id" && r.json.field === "driveExportFolderId", JSON.stringify(r.json));
  r = await post(patchRoute.PATCH, u2, { driveExportFolderId: `https://drive.google.com/drive/folders/${ID}?usp=sharing` }, "PATCH");
  const saved = await prisma.event.findUniqueOrThrow({ where: { id: ev.id } });
  check("saving a pasted URL stores the bare id", r.status === 200 && saved.driveExportFolderId === ID, String(saved.driveExportFolderId));
  check("saving the Drive folders makes the saver the event's Drive owner", saved.driveConfiguredByUserId === u2.id);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
