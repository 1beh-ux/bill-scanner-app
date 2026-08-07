import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { getDriveClient } = await import("../src/lib/drive");

  const fileId = process.argv[2];
  if (!fileId) {
    console.error("Usage: npx tsx scripts/inspect-file.ts <fileId>");
    process.exit(1);
  }

  const drive = await getDriveClient();
  try {
    const res = await drive.files.get({
      fileId,
      fields: "id, name, mimeType, parents, trashed, owners(emailAddress), webViewLink",
      supportsAllDrives: true,
    });
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    console.error("Error fetching file:", err?.message || err);
    console.error("status code:", err?.code || err?.response?.status);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});