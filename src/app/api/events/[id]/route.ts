import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess, requireAnyModuleAccess } from "@/lib/module-access";
import { parseFolderId } from "@/lib/drive-errors";
import { invalidateDriveIdentity } from "@/lib/drive";

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
  const denied = await requireAnyModuleAccess(user, id, ["bills", "health", "mail"]);
  if (denied) return denied;

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(event);
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
    vsEventType,
    vsOrderInYear,
    vsMembershipFieldKey,
    participantsListColumns,
    mailQuestionnaireUrl,
    qrSizeMm,
  } = body;

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
      ...(vsEventType !== undefined && { vsEventType }),
      ...(vsOrderInYear !== undefined && { vsOrderInYear }),
      ...(vsMembershipFieldKey !== undefined && { vsMembershipFieldKey }),
      ...(participantsListColumns !== undefined && { participantsListColumns }),
      ...(qrSizeMm !== undefined && { qrSizeMm: qrSizeMm === null ? null : Math.min(150, Math.max(10, Math.round(Number(qrSizeMm)) || 35)) }),
      ...(mailQuestionnaireUrl !== undefined && { mailQuestionnaireUrl: mailQuestionnaireUrl || null }),
    },
  });
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
  if (user.role !== "admin") {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }

  const { id } = await params;

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