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
import { listAuthorSubfolders, sheetText, upsertSheetByName } from "@/lib/drive";
import { exportFields, readExportColumns } from "@/lib/export-columns";
import { documentDisplayName, type DocumentTypeData } from "@/lib/mail-reply-template";
import { docState } from "@/lib/registration-status";
import { profileDocuments } from "@/lib/person-documents";
import { detailsDocuments } from "@/lib/details-documents";
import { participantsRootFolderId, syncParticipantDocumentsToDrive } from "@/lib/mail-drive-sync";

const DOC_STATE_TEXT = { received: "přijato", pending: "ke kontrole", rejected: "zamítnuto", none: "chybí" } as const;

export async function exportParticipantsToDrive(
  eventId: string,
  user: User
): Promise<{ count: number; spreadsheetId: string; files: { synced: number; skipped: number } | null } | { error: "no_export_folder" }> {
  const event = await withMembers(await prisma.event.findUniqueOrThrow({ where: { id: eventId }, include: { organization: { select: { exportColumns: true } } } }));
  if (!event.driveExportFolderId) return { error: "no_export_folder" };
  const [allowed, fields, participants, docTypes] = await Promise.all([
    allowedParticipantFieldKeys(user, eventId),
    prisma.eventParticipantField.findMany({ where: { eventId, active: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
    prisma.participant.findMany({ where: { eventId }, include: { guardians: true, documents: true } }),
    prisma.eventListItem.findMany({ where: { eventId, kind: "document", active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  // Fixed attachments (the same file for everyone) aren't tracked.
  const tracked = docTypes.filter((d) => !(d.data as DocumentTypeData | null)?.staticAttachment);
  const [fromProfile, fromDetails] = await Promise.all([profileDocuments(participants), detailsDocuments(participants.map((p) => p.id))]);
  // The chosen columns in their order (the event's, else the organization's), else every field the user may see.
  const shown = exportFields(
    fields.filter((f) => allowed.has(f.key) && f.fieldType !== "image"),
    readExportColumns(event.exportColumns) ?? readExportColumns(event.organization.exportColumns)
  );
  participants.sort(compareParticipantsBySurname);
  // The files go first, so the "Složka" column links the participants' folders (one listing of the root).
  const root = participantsRootFolderId(event);
  const files = root ? await syncParticipantDocumentsToDrive(eventId) : null;
  const folders = root ? new Map((await listAuthorSubfolders(eventId, root, "participants")).map((f) => [f.name, f.id])) : new Map<string, string>();
  const folderCell = (name: string) => {
    const id = folders.get(name);
    return id ? `=HYPERLINK("https://drive.google.com/drive/folders/${id}","složka")` : "";
  };
  const rows: string[][] = [
    ["Přihláška", ...shown.map((f) => f.label), ...tracked.map((d) => documentDisplayName({ ...d, data: d.data as DocumentTypeData | null })), ...(root ? ["Složka"] : [])],
    ...participants.map((p) => {
      const values = fieldTextValues({ ...p, customFieldValues: p.customFieldValues as Record<string, string> | null }, event, fields);
      const docs = [...p.documents, ...(fromProfile.get(p.id) ?? []), ...(fromDetails.get(p.id) ?? [])];
      return [p.registrationStatus === "accepted" ? "přijatá" : "čeká", ...shown.map((f) => sheetText(values[f.key] ?? "")), ...tracked.map((d) => DOC_STATE_TEXT[docState(docs, d.id).state]), ...(root ? [folderCell(p.name)] : [])];
    }),
  ];
  const spreadsheetId = await upsertSheetByName(eventId, event.driveExportFolderId, `Účastníci – ${event.name}`, rows);
  return { count: participants.length, spreadsheetId, files };
}
