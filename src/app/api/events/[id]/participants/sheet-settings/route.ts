import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";

// Persisted "Seznam účastníků" registration-sheet connection: a spreadsheet
// id plus a column-name -> field mapping, set up once instead of re-pasting
// and remapping on every import. Shared by health and mail admins alike (the
// central participants section is gated the same way).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { participantsSheetId: true, participantsColumnMapping: true },
  });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(event);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;

  const body = await req.json();
  const event = await prisma.event.update({
    where: { id: eventId },
    data: {
      participantsSheetId: body.participantsSheetId ?? null,
      participantsColumnMapping: body.participantsColumnMapping ?? undefined,
    },
    select: { participantsSheetId: true, participantsColumnMapping: true },
  });

  return NextResponse.json(event);
}
