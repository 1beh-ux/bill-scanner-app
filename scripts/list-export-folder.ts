import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { getDriveClient } = await import("../src/lib/drive");

  const eventId = process.argv[2];
  if (!eventId) {
    console.error("Usage: npx tsx scripts/list-export-folder.ts <eventId>");
    process.exit(1);
  }

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    console.error("Event not found");
    process.exit(1);
  }

  console.log("Event:", event.name);
  console.log("driveIngestFolderId:", event.driveIngestFolderId);
  console.log("driveExportFolderId:", event.driveExportFolderId);
  console.log("driveManifestSpreadsheetId:", event.driveManifestSpreadsheetId);

  if (!event.driveExportFolderId) {
    console.error("No export folder set on this event.");
    process.exit(1);
  }

  const drive = await getDriveClient();
  const res = await drive.files.list({
    q: `'${event.driveExportFolderId}' in parents and trashed = false`,
    fields: "files(id, name, mimeType, createdTime, webViewLink)",
    pageSize: 200,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const files = res.data.files ?? [];
  console.log(`\nFound ${files.length} item(s) in the export folder:\n`);
  for (const f of files) {
    console.log(`- ${f.name}  [${f.mimeType}]  created ${f.createdTime}`);
    console.log(`  ${f.webViewLink}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});