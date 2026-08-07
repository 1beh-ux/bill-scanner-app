import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { exportEventBills, DriveExportError } from "@/lib/drive-export";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: eventId } = await params;

  try {
    const summary = await exportEventBills(eventId);
    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof DriveExportError) {
      const status = err.code === "event_not_found" ? 404 : 400;
      return NextResponse.json({ error: err.code }, { status });
    }
    throw err;
  }
}