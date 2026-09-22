import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";

// Was health-only -- widened to health-or-mail (Part 2 of the participants/settings
// prompt: "Guardians must be editable [in the central roster], and the central
// roster is reachable by health or mail alike, same as the rest of that page).
export async function POST(
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

  const body = await req.json();
  const { name, email, relationship, phone, receivesCommunications } = body;

  if (!email || typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "guardian_email_required" }, { status: 400 });
  }

  const guardian = await prisma.participantGuardian.create({
    data: {
      participantId,
      name: name?.trim() || null,
      email: email.trim(),
      relationship: relationship?.trim() || null,
      phone: phone?.trim() || null,
      receivesCommunications: receivesCommunications ?? true,
    },
  });

  return NextResponse.json(guardian, { status: 201 });
}
