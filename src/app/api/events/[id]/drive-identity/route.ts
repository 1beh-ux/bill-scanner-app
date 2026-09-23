import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { getDriveIdentity } from "@/lib/drive";

// Who does this event's Drive work (a user's connected Google account, or the
// service account as a fallback with a reason), and the caller's own
// connection state. Read by the Drive tab and by the Sheets-import page (the
// sheet must be shared with `identity.email`).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireAnyModuleAccess(user, eventId, ["bills", "health", "mail", "planning"]);
  if (denied) return denied;

  const [identity, mine, event] = await Promise.all([
    getDriveIdentity(eventId),
    prisma.driveAccount.findUnique({ where: { connectedByUserId: user.id }, select: { email: true, connectedAt: true, tokenInvalidAt: true } }),
    prisma.event.findUnique({
      where: { id: eventId },
      select: { driveIngestFolderId: true, driveExportFolderId: true, driveParticipantsFolderId: true },
    }),
  ]);

  const folders = [event?.driveIngestFolderId, event?.driveExportFolderId].filter((f): f is string => !!f);
  return NextResponse.json({
    identity: {
      kind: identity.kind,
      email: identity.email,
      serviceAccountEmail: identity.serviceAccountEmail,
      connectedAt: identity.connectedAt ?? null,
      configuredBy: identity.configuredBy ?? null,
      warning: identity.warning ?? null,
    },
    me: {
      connected: !!mine,
      email: mine?.email ?? null,
      connectedAt: mine?.connectedAt ?? null,
      tokenInvalid: !!mine?.tokenInvalidAt,
    },
    isConfiguredByMe: identity.configuredBy?.id === user.id,
    // Ingest and export pointing at the same folder mixes imported receipts with exported ones.
    sameFolder: folders.length === 2 && folders[0] === folders[1],
  });
}
