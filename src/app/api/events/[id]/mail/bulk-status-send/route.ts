import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { sendBulkStatusUpdates } from "@/lib/mail-bulk-status-send";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "mail");
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const participantIds: string[] = Array.isArray(body.participantIds) ? body.participantIds : [];
  if (participantIds.length === 0) {
    return NextResponse.json({ error: "participant_ids_required" }, { status: 400 });
  }

  const results = await sendBulkStatusUpdates(eventId, participantIds, user.id);
  const sentCount = results.filter((r) => r.status === "sent").length;
  const failedCount = results.filter((r) => r.status === "failed").length;

  return NextResponse.json({ sentCount, failedCount, results });
}
