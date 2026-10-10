import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess, requireAnyModuleAccess } from "@/lib/module-access";
import { parseFolderId } from "@/lib/drive-errors";
import { normalizeBillColumns } from "@/lib/bill-columns";
import { invalidateDriveIdentity } from "@/lib/drive";
import { linkChildren } from "@/lib/children";
import { readEligibility } from "@/lib/portal-rules";
import { readPriceRules } from "@/lib/price-rules";
import { SLUG_PATTERN } from "@/lib/public-registration";
import { eventSender } from "@/lib/auto-accept";
import { publicUrl } from "@/lib/public-host";
import { isOrgAdmin, requireEventInOrg } from "@/lib/org-scope";

// GET is readable by any module grant -- the row carries no module-specific
// secrets (senderEmail/drive folder ids/sync settings are shared config,
// not health data), and Mail Helper's own page needs it for the event name
// and connected mailbox just like every other module's settings screen does.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const denied = await requireAnyModuleAccess(user, id, ["bills", "health", "mail", "planning"]);
  if (denied) return denied;

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Auto-send needs a connected sending account; without one it only accepts (settings warn).
  const autoSendReady = event.autoAccept === "accept_send" ? !!(await eventSender(event)) : null;
  return NextResponse.json({ ...event, autoSendReady, publicBaseUrl: await publicUrl("registration", id, "", event.organizationId) });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const denied = await requireModuleAccess(user, id, "bills");
  if (denied) return denied;

  const body = await req.json();
  const {
    name,
    startDate,
    endDate,
    memberPriceCzk,
    nonMemberPriceCzk,
    registrationBankAccountNumber,
    registrationBankCode,
    vsYear,
    vsEventType,
    vsOrderInYear,
    vsMembershipFieldKey,
    vsMemberValues,
    participantsListColumns,
    mailQuestionnaireUrl,
    qrSizeMm,
    billsListColumns,
    registrationDeadline,
    kind,
    membershipYear,
    registrationConnected,
    peopleLinkMode,
    portalOpen,
    eligibility,
    priceRules,
    publicRegistration,
    publicSlug,
    landingContent,
    autoAccept,
    location,
    portalInfo,
    paymentDocTypeId,
  } = body;

  // Registration & membership switches: admin only, validated.
  const touchesRegistration =
    kind !== undefined ||
    membershipYear !== undefined ||
    registrationConnected !== undefined ||
    peopleLinkMode !== undefined ||
    portalOpen !== undefined ||
    eligibility !== undefined ||
    publicRegistration !== undefined ||
    publicSlug !== undefined ||
    landingContent !== undefined ||
    autoAccept !== undefined ||
    location !== undefined ||
    portalInfo !== undefined ||
    paymentDocTypeId !== undefined;
  for (const v of [location, portalInfo]) if (v !== undefined && v !== null && !(typeof v === "string" && v.length <= 2000)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (autoAccept !== undefined && !["manual", "accept", "accept_send"].includes(autoAccept)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  // Public registration page (slice 3 D): /r/<slug>, lowercase letters, digits, dashes.
  if (publicRegistration !== undefined && typeof publicRegistration !== "boolean") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (publicSlug !== undefined && publicSlug !== null && !(typeof publicSlug === "string" && SLUG_PATTERN.test(publicSlug))) return NextResponse.json({ error: "bad_slug" }, { status: 400 });
  if (landingContent !== undefined && landingContent !== null && !(typeof landingContent === "string" && landingContent.length <= 20000)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (publicSlug && (await prisma.event.findFirst({ where: { publicSlug, id: { not: id } }, select: { id: true } }))) return NextResponse.json({ error: "slug_taken" }, { status: 409 });
  // "Dokument platby" (slice 4 #5): one of this event's document types, or null.
  if (
    paymentDocTypeId !== undefined &&
    paymentDocTypeId !== null &&
    !(typeof paymentDocTypeId === "string" && (await prisma.eventListItem.findFirst({ where: { id: paymentDocTypeId, eventId: id, kind: "document" }, select: { id: true } })))
  ) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (portalOpen !== undefined && typeof portalOpen !== "boolean") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (touchesRegistration && !isOrgAdmin(user)) return NextResponse.json({ error: "admin_only" }, { status: 403 });
  if (kind !== undefined && kind !== "event" && kind !== "membership") return NextResponse.json({ error: "bad_kind" }, { status: 400 });
  if (membershipYear !== undefined && membershipYear !== null && !(Number.isInteger(membershipYear) && membershipYear >= 2000 && membershipYear <= 2100)) {
    return NextResponse.json({ error: "bad_membership_year" }, { status: 400 });
  }
  if (registrationConnected !== undefined && typeof registrationConnected !== "boolean") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (peopleLinkMode !== undefined && peopleLinkMode !== "all" && peopleLinkMode !== "existing") return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // Drive folders: a pasted Drive URL is reduced to its folder id; anything that
  // is not recognisably an id is rejected (and says which field). Empty = unset.
  const folderIds: Record<"driveIngestFolderId" | "driveExportFolderId" | "driveParticipantsFolderId", string | null | undefined> = {
    driveIngestFolderId: undefined,
    driveExportFolderId: undefined,
    driveParticipantsFolderId: undefined,
  };
  for (const field of Object.keys(folderIds) as (keyof typeof folderIds)[]) {
    const raw = body[field];
    if (raw === undefined) continue;
    if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
      folderIds[field] = null;
      continue;
    }
    const parsed = typeof raw === "string" ? parseFolderId(raw) : null;
    if (!parsed) return NextResponse.json({ error: "not_a_folder_id", field }, { status: 400 });
    folderIds[field] = parsed;
  }
  const driveIngestFolderId = folderIds.driveIngestFolderId;
  const driveExportFolderId = folderIds.driveExportFolderId;
  const driveParticipantsFolderId = folderIds.driveParticipantsFolderId;
  // Whoever saves the Drive folders becomes the person whose Google account the
  // event's Drive work runs as (see DriveAccount / getDriveIdentity).
  const savesDrive = driveIngestFolderId !== undefined || driveExportFolderId !== undefined || driveParticipantsFolderId !== undefined;

  // Everything already exported/synced was written to the *old* folder, and
  // the manifest sheet id is remembered per event -- so after a folder change
  // the export would report "already exported" and keep updating the old
  // sheet. Forget all of that so the next export/sync starts fresh in the new
  // folder. (Files already in the old folder are left alone.)
  const before =
    driveExportFolderId !== undefined || driveParticipantsFolderId !== undefined
      ? await prisma.event.findUnique({ where: { id }, select: { driveExportFolderId: true, driveParticipantsFolderId: true } })
      : null;
  const nextExport = driveExportFolderId !== undefined ? driveExportFolderId : before?.driveExportFolderId;
  const nextParticipants = driveParticipantsFolderId !== undefined ? driveParticipantsFolderId : before?.driveParticipantsFolderId;
  const exportFolderChanged = before !== null && (before.driveExportFolderId ?? null) !== (nextExport ?? null);
  // Participant files go to the participants folder, else the export folder.
  const participantsTargetChanged =
    before !== null &&
    (before.driveParticipantsFolderId ?? before.driveExportFolderId ?? null) !== (nextParticipants ?? nextExport ?? null);

  const event = await prisma.event.update({
    where: { id },
    data: {
      ...(exportFolderChanged && { driveManifestSpreadsheetId: null }),
      ...(savesDrive && { driveConfiguredByUserId: user.id }),
      ...(name !== undefined && { name }),
      ...(startDate !== undefined && { startDate: new Date(startDate) }),
      ...(endDate !== undefined && { endDate: new Date(endDate) }),
      ...(driveIngestFolderId !== undefined && { driveIngestFolderId }),
      ...(driveExportFolderId !== undefined && { driveExportFolderId }),
      ...(driveParticipantsFolderId !== undefined && { driveParticipantsFolderId }),
      ...(memberPriceCzk !== undefined && { memberPriceCzk }),
      ...(nonMemberPriceCzk !== undefined && { nonMemberPriceCzk }),
      ...(registrationBankAccountNumber !== undefined && { registrationBankAccountNumber }),
      ...(registrationBankCode !== undefined && { registrationBankCode }),
      ...(vsYear !== undefined && { vsYear: vsYear === null || vsYear === "" ? null : Math.abs(Math.trunc(Number(vsYear))) % 100 }),
      ...(vsEventType !== undefined && { vsEventType }),
      ...(vsOrderInYear !== undefined && { vsOrderInYear }),
      ...(vsMembershipFieldKey !== undefined && { vsMembershipFieldKey }),
      ...(Array.isArray(vsMemberValues) && {
        vsMemberValues: vsMemberValues.filter((v: unknown): v is string => typeof v === "string").map((v: string) => v.trim().toLowerCase()).filter(Boolean).slice(0, 50),
      }),
      ...(participantsListColumns !== undefined && { participantsListColumns }),
      // Bills list columns: per event, anyone with bills access may set them. Unknown keys are
      // dropped, required columns kept; null resets to the default set.
      ...(billsListColumns !== undefined && {
        billsListColumns: billsListColumns === null ? Prisma.DbNull : normalizeBillColumns(billsListColumns),
      }),
      ...(qrSizeMm !== undefined && { qrSizeMm: qrSizeMm === null ? null : Math.min(150, Math.max(10, Math.round(Number(qrSizeMm)) || 35)) }),
      ...(mailQuestionnaireUrl !== undefined && { mailQuestionnaireUrl: mailQuestionnaireUrl || null }),
      ...(registrationDeadline !== undefined && { registrationDeadline: registrationDeadline ? new Date(registrationDeadline) : null }),
      ...(kind !== undefined && { kind }),
      ...(membershipYear !== undefined && { membershipYear }),
      ...(registrationConnected !== undefined && { registrationConnected }),
      ...((registrationConnected === true || kind === "membership") && { peopleUnlinked: false }),
      ...(peopleLinkMode !== undefined && { peopleLinkMode }),
      ...(portalOpen !== undefined && { portalOpen }),
      // Stored cleaned (src/lib/portal-rules.ts readEligibility); null/{} = nobody.
      ...(eligibility !== undefined && { eligibility: eligibility === null ? Prisma.DbNull : readEligibility(eligibility) }),
      // Price rules (slice 3 C), stored cleaned; null (or nothing usable) = today's member/non-member pricing.
      ...(priceRules !== undefined && { priceRules: readPriceRules(priceRules) ?? Prisma.DbNull }),
      ...(publicRegistration !== undefined && { publicRegistration }),
      ...(publicSlug !== undefined && { publicSlug: publicSlug || null }),
      ...(landingContent !== undefined && { landingContent: landingContent?.trim() || null }),
      ...(autoAccept !== undefined && { autoAccept }),
      // Portal registration card basics (slice 3 F).
      ...(location !== undefined && { location: location?.trim() || null }),
      ...(portalInfo !== undefined && { portalInfo: portalInfo?.trim() || null }),
      ...(paymentDocTypeId !== undefined && { paymentDocTypeId: paymentDocTypeId || null }),
    },
  });
  // Switching the connection on (or making it a membership year) links the participants already there
  // (by the event's peopleLinkMode, slice 8 #3); so does switching a connected event back to "all".
  if (registrationConnected === true || kind === "membership" || (peopleLinkMode === "all" && (event.registrationConnected || event.kind === "membership"))) {
    await linkChildren({ eventId: id });
  }
  if (savesDrive) invalidateDriveIdentity(id);
  if (exportFolderChanged) {
    await prisma.bill.updateMany({
      where: { eventId: id, OR: [{ exportFilename: { not: null } }, { exportedAt: { not: null } }] },
      data: { exportFilename: null, exportedAt: null },
    });
  }
  if (participantsTargetChanged) {
    await prisma.participantDocument.updateMany({
      where: { participant: { eventId: id }, driveFileId: { not: null } },
      data: { driveFileId: null, driveSyncedAt: null },
    });
  }
  return NextResponse.json(event);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isOrgAdmin(user)) {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }

  const { id } = await params;
  const inOrg = await requireEventInOrg(user, id);
  if ("error" in inOrg) return inOrg.error;

  // Checked explicitly, not just inferred from a caught constraint error —
  // this is almost always the actual reason deletion is blocked in
  // practice, and it deserves a specific, accurate message with a real
  // count, not a generic "some dependency exists" message.
  const billCount = await prisma.bill.count({ where: { eventId: id } });
  if (billCount > 0) {
    return NextResponse.json({ error: "event_has_bills", billCount }, { status: 409 });
  }

  try {
    await prisma.event.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json({ error: "event_has_dependencies" }, { status: 409 });
    }
    throw err;
  }
}