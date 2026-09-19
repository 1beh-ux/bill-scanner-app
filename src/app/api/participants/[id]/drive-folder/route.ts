import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { getOrCreateSubfolder } from "@/lib/drive";
import { participantsRootFolderId } from "@/lib/mail-drive-sync";

// Where this participant's documents live in Drive ({participants folder}/
// {name}/) -- created if it isn't there yet, so the link always works.
// POST rather than GET because it can create the folder.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;

  const participant = await prisma.participant.findUnique({ where: { id }, include: { event: true } });
  if (!participant) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const denied = await requireAnyModuleAccess(user, participant.eventId, ["health", "mail"]);
  if (denied) return denied;

  const rootFolderId = participantsRootFolderId(participant.event);
  if (!rootFolderId) return NextResponse.json({ error: "no_participants_folder" }, { status: 409 });

  try {
    const folderId = await getOrCreateSubfolder(rootFolderId, participant.name);
    return NextResponse.json({ url: `https://drive.google.com/drive/folders/${folderId}` });
  } catch (err) {
    console.error("[drive-folder] failed:", err);
    return NextResponse.json({ error: "drive_failed" }, { status: 502 });
  }
}
