import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { getActiveDocumentTypes, getReceivedItemIds } from "@/lib/mail-helper-context";
import { documentDisplayName } from "@/lib/mail-reply-template";

// Lean, mail-scoped roster read -- deliberately NOT the full
// /api/events/[id]/participants route, which carries health fields
// (allergies/medsNotes/chronicIssues/otherNotes) that a mail-only grant
// must never see. Used for participant auto-detection/override in the
// inbox detail panel, the bulk status-update roster, and the Mail
// participants list (name/age/acceptance/per-document-type status).
export async function GET(
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

  const withDocs = new URL(req.url).searchParams.get("withDocuments") === "1";

  const participants = await prisma.participant.findMany({
    where: { eventId, active: true },
    select: {
      id: true,
      name: true,
      dateOfBirth: true,
      registrationStatus: true,
      guardians: {
        select: { id: true, name: true, email: true, receivesCommunications: true },
      },
    },
    orderBy: { name: "asc" },
  });

  if (!withDocs) return NextResponse.json(participants);

  const documentTypes = await getActiveDocumentTypes(eventId);
  const withDocuments = await Promise.all(
    participants.map(async (p) => {
      const receivedItemIds = await getReceivedItemIds(p.id);
      return {
        ...p,
        documents: documentTypes.map((d) => ({
          eventListItemId: d.id,
          name: documentDisplayName(d),
          received: receivedItemIds.has(d.id),
        })),
      };
    })
  );

  return NextResponse.json(withDocuments);
}
