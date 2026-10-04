import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { allowedParticipantFieldKeys, requireAnyModuleAccess } from "@/lib/module-access";
import { fieldTextValues } from "@/lib/document-variables";
import { withMembers } from "@/lib/children";

// One participant's display value of every field (computed/combined ones too,
// Ano/Ne readable) -- for read-only sections like the Zdraví detail's own ones.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const participant = await prisma.participant.findUnique({ where: { id }, include: { guardians: true } });
  if (!participant) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const denied = await requireAnyModuleAccess(user, participant.eventId, ["health", "mail"]);
  if (denied) return denied;
  const [event, fields, allowed] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: participant.eventId } }).then(withMembers),
    prisma.eventParticipantField.findMany({ where: { eventId: participant.eventId, active: true } }),
    allowedParticipantFieldKeys(user, participant.eventId),
  ]);
  const values = fieldTextValues({ ...participant, customFieldValues: participant.customFieldValues as Record<string, string> | null }, event, fields);
  return NextResponse.json({ values: Object.fromEntries(Object.entries(values).filter(([k]) => allowed.has(k))) });
}
