// Usage metering: fills sizeBytes from GCS object metadata for rows that have a file but no size
// yet. Idempotent (only null sizes); a missing object stays null and is counted as "missing".
// Run once after the usage-metrics deploy: npx tsx scripts/backfill-gcs-sizes.ts
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { gcsSize } = await import("../src/lib/gcs");

  type Row = { id: string; paths: (string | null)[] };
  const tables: { name: string; rows: () => Promise<Row[]>; save: (id: string, size: bigint) => Promise<unknown> }[] = [
    {
      name: "bills",
      rows: async () => (await prisma.bill.findMany({ where: { sizeBytes: null }, select: { id: true, gcsObjectPath: true, originalGcsObjectPath: true } })).map((r) => ({ id: r.id, paths: [r.gcsObjectPath, r.originalGcsObjectPath] })),
      save: (id, sizeBytes) => prisma.bill.update({ where: { id }, data: { sizeBytes } }),
    },
    {
      name: "incidents",
      rows: async () => (await prisma.incident.findMany({ where: { sizeBytes: null, photoGcsPath: { not: null } }, select: { id: true, photoGcsPath: true } })).map((r) => ({ id: r.id, paths: [r.photoGcsPath] })),
      save: (id, sizeBytes) => prisma.incident.update({ where: { id }, data: { sizeBytes } }),
    },
    {
      name: "incident_updates",
      rows: async () => (await prisma.incidentUpdate.findMany({ where: { sizeBytes: null, photoGcsPath: { not: null } }, select: { id: true, photoGcsPath: true } })).map((r) => ({ id: r.id, paths: [r.photoGcsPath] })),
      save: (id, sizeBytes) => prisma.incidentUpdate.update({ where: { id }, data: { sizeBytes } }),
    },
    {
      name: "parent_email_log",
      rows: async () => (await prisma.parentEmailLog.findMany({ where: { sizeBytes: null, pdfGcsPath: { not: null } }, select: { id: true, pdfGcsPath: true } })).map((r) => ({ id: r.id, paths: [r.pdfGcsPath] })),
      save: (id, sizeBytes) => prisma.parentEmailLog.update({ where: { id }, data: { sizeBytes } }),
    },
    {
      name: "participant_documents",
      rows: async () => (await prisma.participantDocument.findMany({ where: { sizeBytes: null, gcsPath: { not: null } }, select: { id: true, gcsPath: true } })).map((r) => ({ id: r.id, paths: [r.gcsPath] })),
      save: (id, sizeBytes) => prisma.participantDocument.update({ where: { id }, data: { sizeBytes } }),
    },
    {
      name: "person_documents",
      rows: async () => (await prisma.personDocument.findMany({ where: { sizeBytes: null }, select: { id: true, gcsPath: true } })).map((r) => ({ id: r.id, paths: [r.gcsPath] })),
      save: (id, sizeBytes) => prisma.personDocument.update({ where: { id }, data: { sizeBytes } }),
    },
  ];

  for (const t of tables) {
    const rows = await t.rows();
    let updated = 0, missing = 0, bytes = BigInt(0);
    for (let i = 0; i < rows.length; i += 20) {
      await Promise.all(
        rows.slice(i, i + 20).map(async (r) => {
          const size = await gcsSize(...r.paths);
          if (size === null) return void missing++;
          await t.save(r.id, size);
          updated++;
          bytes += size;
        })
      );
    }
    console.log(`${t.name}: ${rows.length} without size, ${updated} updated (${(Number(bytes) / 1e6).toFixed(1)} MB), ${missing} object(s) missing in GCS`);
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
