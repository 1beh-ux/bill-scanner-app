import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { documentDisplayName, type DocumentTypeData } from "@/lib/mail-reply-template";
import { getActiveDocumentTypes } from "@/lib/mail-helper-context";
import { RECEIVED_WHERE } from "@/lib/registration-status";

// Part 11-D of the participants/settings/Health/Mail prompt: what the inbox (or a manual
// mark) saved for this participant, checkable without opening Drive. Excludes `generated`
// rows (a blank form we sent them, not something they returned -- same distinction
// getReceivedItemIds already draws elsewhere), and portal uploads still in review
// or rejected (slice 4 #6) -- byType lists those per type as `review` instead.
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
    where: { participantId, ...RECEIVED_WHERE },
    orderBy: { receivedAt: "desc" },
    include: { eventListItem: true },
  });

  // ?byType=1: one row per tracked document type, received or missing (participant detail page).
  if (new URL(req.url).searchParams.get("byType") === "1") {
    const [types, inReview] = await Promise.all([
      getActiveDocumentTypes(participant.eventId),
      prisma.participantDocument.findMany({ where: { participantId, reviewStatus: { in: ["pending", "rejected"] } }, orderBy: { receivedAt: "desc" } }),
    ]);
    return NextResponse.json(
      types.map((type) => {
        const latest = docs.find((d) => d.eventListItemId === type.id);
        // The newest received file of the type (Zobrazit / Stáhnout, slice 6 #3).
        const file = docs.find((d) => d.eventListItemId === type.id && d.gcsPath);
        return {
          // Portal uploads waiting for review (Schválit / Zamítnout) or rejected, newest first.
          review: inReview
            .filter((d) => d.eventListItemId === type.id)
            .map((d) => ({ id: d.id, filename: d.originalFilename, receivedAt: d.receivedAt, status: d.reviewStatus, note: d.reviewNote })),
          docTypeId: type.id,
          name: documentDisplayName(type),
          received: !!latest,
          receivedAt: latest?.receivedAt ?? null,
          receivedVia: latest?.receivedVia ?? null,
          fileId: file?.id ?? null,
          driveUrl: latest?.driveFileId ? `https://drive.google.com/file/d/${latest.driveFileId}/view` : null,
        };
      })
    );
  }

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
