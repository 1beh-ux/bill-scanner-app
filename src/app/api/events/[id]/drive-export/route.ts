import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { exportEventBills, DriveExportError } from "@/lib/drive-export";
import { DriveError, httpStatusForDriveError } from "@/lib/drive-errors";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  try {
    const summary = await exportEventBills(eventId, { recreateManifest: body?.recreateManifest === true });
    return NextResponse.json(summary);
  } catch (err) {
    // Known Drive failures come back as a stable code + the identity/folder involved.
    if (err instanceof DriveError) {
      return NextResponse.json({ error: err.code, ...err.params }, { status: httpStatusForDriveError(err.code) });
    }
    if (err instanceof DriveExportError) {
      const status = err.code === "event_not_found" ? 404 : 400;
      return NextResponse.json({ error: err.code }, { status });
    }
    throw err;
  }
}