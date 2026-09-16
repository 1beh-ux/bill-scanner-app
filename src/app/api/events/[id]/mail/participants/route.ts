import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { getActiveDocumentTypes, getReceivedItemIds } from "@/lib/mail-helper-context";
import { documentDisplayName } from "@/lib/mail-reply-template";

// Lean, mail-scoped roster read -- deliberately NOT the full
// /api/events/[id]/participants route, which carries health-only fields
// that a mail-only grant must never see. Health notes and every other
// custom field now share one JSON blob (Participant.customFieldValues),
// so unlike before the DB query alone can't exclude them -- this strips
// customFieldValues down to only keys whose field is flagged for the
// mail_list surface before the response goes out. Used for participant
// auto-detection/override in the inbox detail panel, the bulk
// status-update roster, and the Mail participants list (name/age/
// acceptance/per-document-type status/mail_list custom columns).
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

  const mailListFields = await prisma.eventParticipantField.findMany({
    where: { eventId, active: true, surfaces: { has: "mail_list" } },
    select: { key: true },
  });
  const allowedKeys = new Set(mailListFields.map((f) => f.key));

  const participants = await prisma.participant.findMany({
    where: { eventId, active: true },
    select: {
      id: true,
      name: true,
      dateOfBirth: true,
      registrationStatus: true,
      customFieldValues: true,
      guardians: {
        select: { id: true, name: true, email: true, receivesCommunications: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const scoped = participants.map((p) => ({
    ...p,
    customFieldValues: Object.fromEntries(
      Object.entries((p.customFieldValues as Record<string, string> | null) ?? {}).filter(([key]) =>
        allowedKeys.has(key)
      )
    ),
  }));

  if (!withDocs) return NextResponse.json(scoped);

  const documentTypes = await getActiveDocumentTypes(eventId);
  const withDocuments = await Promise.all(
    scoped.map(async (p) => {
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
