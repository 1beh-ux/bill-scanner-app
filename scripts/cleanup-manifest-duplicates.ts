import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { getDriveClient } = await import("../src/lib/drive");

  const exportFolderId = process.argv[2];
  const title = process.argv[3];
  if (!exportFolderId || !title) {
    console.error('Usage: npx tsx scripts/cleanup-manifest-duplicates.ts <exportFolderId> "<title>"');
    process.exit(1);
  }

  const drive = await getDriveClient();
  const escapedTitle = title.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `'${exportFolderId}' in parents and name = '${escapedTitle}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
    fields: "files(id, name, createdTime)",
    pageSize: 200,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const files = res.data.files ?? [];
  console.log(`Found ${files.length} file(s) named "${title}"`);

  for (const f of files) {
    if (!f.id) continue;
    await drive.files.delete({ fileId: f.id, supportsAllDrives: true });
    console.log(`Deleted ${f.id} (created ${f.createdTime})`);
  }

  console.log("Done — next export will create exactly one fresh manifest.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});