import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { exportParticipantsToDrive } from "@/lib/participants-drive-export";
import { DriveError, httpStatusForDriveError } from "@/lib/drive-errors";

// Seznam účastníků -> Google Sheet in the export folder (src/lib/participants-drive-export.ts).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireAnyModuleAccess(user, eventId, ["participants", "health", "mail"]);
  if (denied) return denied;
  try {
    const r = await exportParticipantsToDrive(eventId, user);
    if ("error" in r) return NextResponse.json(r, { status: 400 });
    return NextResponse.json({ ...r, url: `https://docs.google.com/spreadsheets/d/${r.spreadsheetId}/edit` });
  } catch (err) {
    if (err instanceof DriveError) return NextResponse.json({ error: err.code, ...err.params }, { status: httpStatusForDriveError(err.code) });
    throw err;
  }
}
