// STAGING ONLY (docs/staging/plan.md): invented test files in the Shared Drive "Tábornik STAGING", created AS the
// staging Drive service account (the only identity staging uses for Drive), then linked to the staging events.
//   bash scripts/staging/run-staging-db.sh npx tsx scripts/staging/seed-staging-drive.ts
// Needs: the Shared Drive exists and bill-scanner-drive-staging@ is its Content manager; seed-staging.ts has run.
import { execFileSync } from "node:child_process";
import { google } from "googleapis";

const SA = "bill-scanner-drive-staging@prvni-beh-filesaver.iam.gserviceaccount.com";
const SHARED_DRIVE = "Tábornik STAGING";
const FOLDER = "application/vnd.google-apps.folder";

async function main() {
  if (process.env.APP_ENV !== "staging" || !/@127\.0\.0\.1:55440\//.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: not the staging DB");
  const { prisma } = await import("../../src/lib/prisma");
  if (!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }))) throw new Error("refusing: no staging marker in this DB");

  const token = execFileSync("gcloud", ["auth", "print-access-token", `--impersonate-service-account=${SA}`, "--scopes=https://www.googleapis.com/auth/drive"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  const drive = google.drive({ version: "v3", auth });
  const docs = google.docs({ version: "v1", auth });
  const sheets = google.sheets({ version: "v4", auth });

  // Either a Shared Drive of that name (account = member) or a folder of that name shared with the account
  // (e.g. inside an existing Shared Drive) -- "Tábornik"/"Táborník" both accepted.
  const nameRe = /^T[aá]born[ií]k STAGING$/;
  const all = { supportsAllDrives: true };
  const sd = ((await drive.drives.list({ pageSize: 50 })).data.drives ?? []).find((d) => nameRe.test(d.name ?? ""));
  const shared = sd ? null : ((await drive.files.list({ ...all, includeItemsFromAllDrives: true, q: `sharedWithMe and mimeType = '${FOLDER}' and trashed = false`, fields: "files(id,name)" })).data.files ?? []).find((f) => nameRe.test(f.name ?? ""));
  const parentId = sd?.id ?? shared?.id;
  if (!parentId) throw new Error(`Neither a Shared Drive nor a shared folder "${SHARED_DRIVE}" is visible to ${SA}`);
  const create = async (name: string, mimeType: string, parent: string) =>
    (await drive.files.create({ ...all, requestBody: { name, mimeType, parents: [parent] }, fields: "id" })).data.id!;
  const existing = await drive.files.list({ ...all, includeItemsFromAllDrives: true, q: `name = 'Testovací oddíl' and mimeType = '${FOLDER}' and '${parentId}' in parents and trashed = false`, fields: "files(id)" });
  if (existing.data.files?.length) { console.log("already seeded in the staging folder -- nothing to do"); return; }

  const root = await create("Testovací oddíl", FOLDER, parentId);
  const sub: Record<string, string> = {};
  for (const n of ["Šablony", "Účastníci", "Import", "Účtenky", "Export", "Zdraví", "Plánování"]) sub[n] = await create(n, FOLDER, root);

  // Two invented document templates with merge fields.
  const templates = {
    "Šablona – Potvrzení o přihlášce (TEST)": "POTVRZENÍ O PŘIHLÁŠCE (testovací šablona)\n\nÚčastník: {{jmeno}} {{prijmeni}}\nDatum narození: {{datum_narozeni}}\nAdresa: {{adresa}}\nVelikost trička: {{tricko}}\n\nToto je smyšlený dokument pro staging.\n",
    "Šablona – Bezinfekčnost (TEST)": "PROHLÁŠENÍ O BEZINFEKČNOSTI (testovací šablona)\n\nProhlašuji, že {{jmeno}} {{prijmeni}} (nar. {{datum_narozeni}}) ...\nPoznámka: {{poznamka}}\n\nPodpis zákonného zástupce: ____________\n",
  };
  for (const [name, text] of Object.entries(templates)) {
    const id = await create(name, "application/vnd.google-apps.document", sub["Šablony"]);
    await docs.documents.batchUpdate({ documentId: id, requestBody: { requests: [{ insertText: { location: { index: 1 }, text } }] } });
  }

  // Three invented sheets for import tests.
  const header = ["Jméno", "Příjmení", "Datum narození", "E-mail rodiče", "Telefon rodiče", "Velikost trička", "Plavec"];
  const clean = [
    ["Kvido", "Sešitový", "2015-03-14", "rodic.sesitovy@example.invalid", "+420 999 111 001", "134", "ano"],
    ["Albína", "Tužková", "2016-07-02", "rodic.tuzkova@example.invalid", "+420 999 111 002", "122", "ne"],
    ["Hynek", "Pravítkový", "2014-11-30", "rodic.pravitkovy@example.invalid", "+420 999 111 003", "146", "ano"],
    ["Žofie", "Gumová", "2017-01-09", "rodic.gumova@example.invalid", "+420 999 111 004", "122", "ano"],
    ["Bořek", "Kružítkový", "2013-05-21", "rodic.kruzitkovy@example.invalid", "+420 999 111 005", "158", "ne"],
  ];
  const dups = [...clean, clean[1], ["Albina", "Tuzkova", "2016-07-02", "rodic.tuzkova@example.invalid", "", "122", "ne"], ["Sešitový", "Kvido", "14. 3. 2015", "rodic.sesitovy@example.invalid", "", "134", "ano"]];
  const bad = [...clean.slice(0, 2), ["", "Bezejmenný", "2015-02-02", "x@example.invalid", "", "134", "ano"], ["Liliana", "Chybová", "31. 2. 2015", "neplatny-email", "", "XXL", "možná"], ["Radim", "Prázdný", "", "", "", "", ""]];
  const sheetIds: Record<string, string> = {};
  for (const [name, rows] of Object.entries({ "Import – čistý (TEST)": clean, "Import – s duplicitami (TEST)": dups, "Import – chybné řádky (TEST)": bad })) {
    const id = await create(name, "application/vnd.google-apps.spreadsheet", sub["Import"]);
    await sheets.spreadsheets.values.update({ spreadsheetId: id, range: "A1", valueInputOption: "RAW", requestBody: { values: [header, ...rows] } });
    sheetIds[name] = id;
  }

  // Link the upcoming camp to these test folders (only staging-Drive IDs ever go into staging events).
  const camp = await prisma.event.findFirstOrThrow({ where: { publicSlug: "staging-tabor-2027" } });
  await prisma.event.update({
    where: { id: camp.id },
    data: {
      driveParticipantsFolderId: sub["Účastníci"], driveIngestFolderId: sub["Účtenky"], driveExportFolderId: sub["Export"],
      driveHealthFolderId: sub["Zdraví"], drivePlanningFolderId: sub["Plánování"], participantsSheetId: sheetIds["Import – čistý (TEST)"],
    },
  });
  console.log(`Shared Drive seeded: 1 root folder, ${Object.keys(sub).length} subfolders, ${Object.keys(templates).length} doc templates, ${Object.keys(sheetIds).length} sheets; camp event linked`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
