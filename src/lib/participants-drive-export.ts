// Seznam účastníků -> a Google Sheet "Účastníci – <event>" in the event's export folder (next to the
// bills manifest). One row per participant, a column per active field the user may see (the roster's
// rule, allowedParticipantFieldKeys) and one per tracked document (přijato / ke kontrole / zamítnuto /
// chybí); the same sheet is rewritten on every export. Then the received files go to the participants
// folder too (src/lib/mail-drive-sync.ts: a folder per participant, "<jméno>_<dokument>_prijato.pdf").
import type { User } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { allowedParticipantFieldKeys } from "@/lib/module-access";
import { withMembers } from "@/lib/children";
import { fieldTextValues } from "@/lib/document-variables";
import { compareParticipantsBySurname } from "@/lib/participant-name";
import { sheetText, upsertSheetByName } from "@/lib/drive";
import { documentDisplayName, type DocumentTypeData } from "@/lib/mail-reply-template";
import { docState } from "@/lib/registration-status";
import { profileDocuments } from "@/lib/person-documents";
import { participantsRootFolderId, syncParticipantDocumentsToDrive } from "@/lib/mail-drive-sync";

const DOC_STATE_TEXT = { received: "přijato", pending: "ke kontrole", rejected: "zamítnuto", none: "chybí" } as const;

export async function exportParticipantsToDrive(
  eventId: string,
  user: User
): Promise<{ count: number; spreadsheetId: string; files: { synced: number; skipped: number } | null } | { error: "no_export_folder" }> {
  const event = await withMembers(await prisma.event.findUniqueOrThrow({ where: { id: eventId } }));
  if (!event.driveExportFolderId) return { error: "no_export_folder" };
  const [allowed, fields, participants, docTypes] = await Promise.all([
    allowedParticipantFieldKeys(user, eventId),
    prisma.eventParticipantField.findMany({ where: { eventId, active: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
    prisma.participant.findMany({ where: { eventId }, include: { guardians: true, documents: true } }),
    prisma.eventListItem.findMany({ where: { eventId, kind: "document", active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  // Fixed attachments (the same file for everyone) aren't tracked.
  const tracked = docTypes.filter((d) => !(d.data as DocumentTypeData | null)?.staticAttachment);
  const fromProfile = await profileDocuments(participants);
  const shown = fields.filter((f) => allowed.has(f.key));
  participants.sort(compareParticipantsBySurname);
  const rows: string[][] = [
    ["Přihláška", ...shown.map((f) => f.label), ...tracked.map((d) => documentDisplayName({ ...d, data: d.data as DocumentTypeData | null }))],
    ...participants.map((p) => {
      const values = fieldTextValues({ ...p, customFieldValues: p.customFieldValues as Record<string, string> | null }, event, fields);
      const docs = [...p.documents, ...(fromProfile.get(p.id) ?? [])];
      return [p.registrationStatus === "accepted" ? "přijatá" : "čeká", ...shown.map((f) => sheetText(values[f.key] ?? "")), ...tracked.map((d) => DOC_STATE_TEXT[docState(docs, d.id).state])];
    }),
  ];
  const spreadsheetId = await upsertSheetByName(eventId, event.driveExportFolderId, `Účastníci – ${event.name}`, rows);
  // The files that aren't on Drive yet (the same run as "Synchronizovat dokumenty").
  const files = participantsRootFolderId(event) ? await syncParticipantDocumentsToDrive(eventId) : null;
  return { count: participants.length, spreadsheetId, files };
}
