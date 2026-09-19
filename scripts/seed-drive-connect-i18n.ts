// One-off: translation keys for the Drive tab's "connect a Google account" block.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const rows = [
    { key: "driveSettings.connectTitle", cs: "Účet pro nahrávání na Disk", en: "Account for uploading to Drive" },
    {
      key: "driveSettings.connectHint",
      cs: "Servisní účet nemá vlastní úložiště, takže do běžné složky (Můj disk) nahrávat nemůže. Připojte Google účet, jehož úložiště se má použít -- export, synchronizace dokumentů i generování dokumentů pak poběží pod ním. Složky musí být pro tento účet dostupné (typicky je vlastní).",
      en: "The service account has no storage of its own, so it can't upload into a regular (My Drive) folder. Connect the Google account whose storage should be used -- export, document sync and document generation then run as that account. The folders must be accessible to it (typically it owns them).",
    },
    { key: "driveSettings.connectedAs", cs: "Připojeno jako {email}", en: "Connected as {email}" },
    { key: "driveSettings.notConnected", cs: "Nepřipojeno -- používá se servisní účet (funguje jen ve sdíleném disku).", en: "Not connected -- using the service account (only works inside a Shared Drive)." },
    { key: "driveSettings.connect", cs: "Připojit Google účet", en: "Connect Google account" },
    { key: "driveSettings.reconnect", cs: "Připojit jiný / znovu", en: "Reconnect / switch account" },
    { key: "driveSettings.connectDone", cs: "Účet byl připojen.", en: "Account connected." },
    { key: "driveSettings.connectError", cs: "Připojení se nezdařilo.", en: "Connecting failed." },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
    console.log(`  ok: ${row.key}`);
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
