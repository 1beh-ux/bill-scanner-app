import { prisma } from "@/lib/prisma";
import { createManifestSheet, writeManifestValues } from "@/lib/drive";
import { getActiveDocumentTypes, getReceivedItemIds } from "@/lib/mail-helper-context";
import { documentDisplayName } from "@/lib/mail-reply-template";

// Read-only status export -- one Sheet per event, participant name +
// guardian email + one column per document type (received/missing),
// created once and overwritten in place on every sync, never recreated.
// Explicitly one-way, app -> Sheet (see design doc "Infrastructure").
export async function syncStatusSheetExport(eventId: string): Promise<{ sheetId: string } | null> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event?.driveExportFolderId) return null;

  const documentTypes = await getActiveDocumentTypes(eventId);
  const participants = await prisma.participant.findMany({
    where: { eventId, active: true },
    include: { guardians: { where: { receivesCommunications: true } } },
    orderBy: { name: "asc" },
  });

  const header = ["Dítě", "E-mail zákonného zástupce", ...documentTypes.map((d) => documentDisplayName(d))];
  const rows: (string | number)[][] = [header];

  for (const p of participants) {
    const receivedItemIds = await getReceivedItemIds(p.id);
    rows.push([
      p.name,
      p.guardians.map((g) => g.email).join(", "),
      ...documentTypes.map((d) => (receivedItemIds.has(d.id) ? "ANO" : "NE")),
    ]);
  }

  let sheetId = event.statusExportSheetId;
  if (sheetId) {
    await writeManifestValues(sheetId, rows);
  } else {
    sheetId = await createManifestSheet(event.driveExportFolderId, `${event.name} – stav dokumentů`, rows);
  }

  await prisma.event.update({
    where: { id: eventId },
    data: { statusExportSheetId: sheetId, statusExportLastSyncedAt: new Date() },
  });

  return { sheetId };
}
