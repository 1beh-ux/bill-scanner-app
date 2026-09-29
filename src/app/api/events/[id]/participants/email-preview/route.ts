import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { previewParticipantEmail } from "@/lib/participant-bulk-email";

// Compose page preview: the e-mail exactly as the send would fill it in for one participant.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const ids = Array.isArray(body.autoAttachDocumentTypeIds) ? body.autoAttachDocumentTypeIds.filter((x: unknown) => typeof x === "string") : undefined;
  const preview = await previewParticipantEmail({
    eventId,
    participantId: str(body.participantId),
    subject: str(body.subject),
    body: str(body.body),
    sentByUserId: user.id,
    markAccepted: body.markAccepted === true,
    autoAttachDocumentTypeIds: ids,
  });
  if (!preview) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(preview);
}
