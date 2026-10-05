import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { documentDisplayName, type DocumentTypeData } from "@/lib/mail-reply-template";

// "Nahrané dokumenty ke kontrole" (docs/registration-slice4-spec.md 7): the
// event's portal uploads waiting for an admin, oldest first. Same health-or-mail
// grant as the roster. ?count=1: just the number (the roster / Pošta link).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;

  const where = { reviewStatus: "pending" as const, participant: { eventId } };
  if (new URL(req.url).searchParams.get("count")) return NextResponse.json({ count: await prisma.participantDocument.count({ where }) });
  const docs = await prisma.participantDocument.findMany({
    where,
    orderBy: { receivedAt: "asc" },
    include: { participant: { select: { id: true, name: true } }, eventListItem: true },
  });
  return NextResponse.json(
    docs.map((d) => ({
      id: d.id,
      participantId: d.participant.id,
      participantName: d.participant.name,
      docTypeName: documentDisplayName({ ...d.eventListItem, data: d.eventListItem.data as DocumentTypeData | null }),
      filename: d.originalFilename,
      receivedAt: d.receivedAt,
    }))
  );
}
