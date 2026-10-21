// Seznam účastníků -> a Google Sheet "Účastníci – <event>" in the event's export folder (next to the
// bills manifest). One row per participant, a column per active field the user may see (the roster's
// rule, allowedParticipantFieldKeys); the same sheet is rewritten on every export.
import type { User } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { allowedParticipantFieldKeys } from "@/lib/module-access";
import { withMembers } from "@/lib/children";
import { fieldTextValues } from "@/lib/document-variables";
import { compareParticipantsBySurname } from "@/lib/participant-name";
import { sheetText, upsertSheetByName } from "@/lib/drive";

export async function exportParticipantsToDrive(eventId: string, user: User): Promise<{ count: number; spreadsheetId: string } | { error: "no_export_folder" }> {
  const event = await withMembers(await prisma.event.findUniqueOrThrow({ where: { id: eventId } }));
  if (!event.driveExportFolderId) return { error: "no_export_folder" };
  const [allowed, fields, participants] = await Promise.all([
    allowedParticipantFieldKeys(user, eventId),
    prisma.eventParticipantField.findMany({ where: { eventId, active: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
    prisma.participant.findMany({ where: { eventId }, include: { guardians: true } }),
  ]);
  const shown = fields.filter((f) => allowed.has(f.key));
  participants.sort(compareParticipantsBySurname);
  const rows: string[][] = [
    ["Přihláška", ...shown.map((f) => f.label)],
    ...participants.map((p) => {
      const values = fieldTextValues({ ...p, customFieldValues: p.customFieldValues as Record<string, string> | null }, event, fields);
      return [p.registrationStatus === "accepted" ? "přijatá" : "čeká", ...shown.map((f) => sheetText(values[f.key] ?? ""))];
    }),
  ];
  const spreadsheetId = await upsertSheetByName(eventId, event.driveExportFolderId, `Účastníci – ${event.name}`, rows);
  return { count: participants.length, spreadsheetId };
}
