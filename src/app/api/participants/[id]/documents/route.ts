import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { documentDisplayName, type DocumentTypeData } from "@/lib/mail-reply-template";

// Part 11-D of the participants/settings/Health/Mail prompt: what the inbox (or a manual
// mark) saved for this participant, checkable without opening Drive. Excludes `generated`
// rows (a blank form we sent them, not something they returned -- same distinction
// getReceivedItemIds already draws elsewhere).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: participantId } = await params;
  const participant = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!participant) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireAnyModuleAccess(user, participant.eventId, ["health", "mail"]);
  if (denied) return denied;

  const docs = await prisma.participantDocument.findMany({
    where: { participantId, receivedVia: { not: "generated" } },
    orderBy: { receivedAt: "desc" },
    include: { eventListItem: true },
  });

  return NextResponse.json(
    docs.map((d) => ({
      id: d.id,
      docTypeName: documentDisplayName({ ...d.eventListItem, data: d.eventListItem.data as DocumentTypeData | null }),
      filename: d.originalFilename,
      receivedAt: d.receivedAt,
      receivedVia: d.receivedVia,
      driveUrl: d.driveFileId ? `https://drive.google.com/file/d/${d.driveFileId}/view` : null,
    }))
  );
}
