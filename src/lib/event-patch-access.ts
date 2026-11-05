// Who may write which key of PATCH /api/events/[id] (audit 2026-11-05, finding P1): "works with receipts" is
// not "administers the event". Every key the handler reads is listed here; scripts/check-event-patch-access.ts
// fails when the handler reads a key this table doesn't classify, so a new field can't silently become
// writable by a module holder.
import type { ModuleKey } from "@/generated/prisma";

export const DRIVE_FOLDER_KEYS = [
  "driveIngestFolderId", "driveExportFolderId", "driveParticipantsFolderId", "driveProcessedFolderId",
  "driveManifestFolderId", "driveHealthFolderId", "driveParticipantsListFolderId", "drivePlanningFolderId", "driveTicketsFolderId",
] as const;

/** "admin" = organization admins only; a module list = a holder of any of those modules (admins always). */
export const EVENT_PATCH_ACCESS: Record<string, "admin" | ModuleKey[]> = {
  // The event itself: name, dates, kind, place.
  name: "admin", startDate: "admin", endDate: "admin", kind: "admin", location: "admin",
  // Drive: where files go and whose Google account does the work (saving folders makes you that account).
  ...Object.fromEntries(DRIVE_FOLDER_KEYS.map((k) => [k, "admin" as const])),
  // Registration, portal, membership, payments.
  portalOpen: "admin", peopleLinkMode: "admin", eligibility: "admin", priceRules: "admin",
  membershipYear: "admin", membershipCheckYear: "admin", registrationConnected: "admin", registrationDeadline: "admin",
  autoAccept: "admin", portalInfo: "admin", paymentDocTypeId: "admin", bankCheckEnabled: "admin", bankAccountId: "admin",
  memberPriceCzk: "admin", nonMemberPriceCzk: "admin", registrationBankAccountNumber: "admin", registrationBankCode: "admin",
  vsYear: "admin", vsEventType: "admin", vsOrderInYear: "admin", vsMembershipFieldKey: "admin", vsMemberValues: "admin",
  mailQuestionnaireUrl: "admin",
  // Operational settings of the bills list / export: anyone working with the receipts.
  billsListColumns: ["bills"], billsListPills: ["bills"], qrSizeMm: ["bills"], manifestCategoryMode: ["bills"],
  // The participants list's columns: whoever works with the roster.
  participantsListColumns: ["participants", "bills", "health", "mail"],
  // Veřejná přihláška (the public page): Účastníci / Vstupenky holders too.
  publicRegistration: ["participants", "tickets"], publicSlug: ["participants", "tickets"], landingContent: ["participants", "tickets"],
  publicHideHeader: ["participants", "tickets"], publicContactEmail: ["participants", "tickets"], publicAudience: ["participants", "tickets"],
  detailsAfterAcceptance: ["participants", "tickets"],
};

/**
 * What a non-admin needs for this body: "admin_only" when any key is admin-only, else the module sets (one per
 * distinct key class) of which the user must hold at least one module each. Unknown keys change nothing.
 */
export function patchRequirements(body: Record<string, unknown>): "admin_only" | ModuleKey[][] {
  const sets = new Map<string, ModuleKey[]>();
  for (const k of Object.keys(body)) {
    const rule = EVENT_PATCH_ACCESS[k];
    if (rule === undefined) continue;
    if (rule === "admin") return "admin_only";
    sets.set(rule.join(","), rule);
  }
  return [...sets.values()];
}
