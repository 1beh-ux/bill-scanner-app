// Every Drive export in its own folder (2026-11-03): the event's settings (Připojení) per export; an unset one
// falls back to the bill export folder (driveExportFolderId), as everything did before. Client-safe.
export type ExportTarget = "manifest" | "health" | "participantsList" | "planning" | "tickets";
export const EXPORT_TARGET_FIELDS = {
  manifest: "driveManifestFolderId",
  health: "driveHealthFolderId",
  participantsList: "driveParticipantsListFolderId",
  planning: "drivePlanningFolderId",
  tickets: "driveTicketsFolderId",
} as const satisfies Record<ExportTarget, string>;

type Folders = { driveExportFolderId: string | null } & Partial<Record<(typeof EXPORT_TARGET_FIELDS)[ExportTarget], string | null>>;

/** The folder an export writes to: its own, else the bill export folder. */
export const exportFolder = (event: Folders, target: ExportTarget): string | null => event[EXPORT_TARGET_FIELDS[target]] ?? event.driveExportFolderId ?? null;
