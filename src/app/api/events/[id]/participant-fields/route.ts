import { NextRequest, NextResponse } from "next/server";
import type { ParticipantFieldSurface } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess, allowedParticipantFieldKeys } from "@/lib/module-access";

const ALLOWED_SURFACES: ParticipantFieldSurface[] = ["list", "health_list", "health_detail", "mail_list"];

// Participant fields aren't gated to a single module the way
// ListTemplateKind is (med/situation -> health, document -> mail) -- the
// same field can show on the central roster (health-or-mail access) as
// well as either module's own screen, so every route here uses the same
// "health or mail" grant the central roster itself requires.
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

  const { searchParams } = new URL(req.url);
  const surface = searchParams.get("surface") as ParticipantFieldSurface | null;
  const all = searchParams.get("all") === "true";
  if (surface && !ALLOWED_SURFACES.includes(surface)) {
    return NextResponse.json({ error: "invalid_surface" }, { status: 400 });
  }

  const [fields, allowedKeys] = await Promise.all([
    prisma.eventParticipantField.findMany({
      where: {
        eventId,
        ...(all ? {} : { active: true }),
        ...(surface ? { surfaces: { has: surface } } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    }),
    allowedParticipantFieldKeys(user, eventId),
  ]);

  // Field *definitions* get the same health/mail boundary as their
  // values (see allowedParticipantFieldKeys) -- a mail-only grant
  // shouldn't see that a health-only field even exists.
  const visible = fields.filter((f) => allowedKeys.has(f.key));

  const variables = await prisma.mergeVariable.findMany({
    where: { key: { in: visible.map((f) => f.key) } },
    select: { key: true, active: true },
  });
  const activeByKey = new Map(variables.map((v) => [v.key, v.active]));

  return NextResponse.json(visible.map((f) => ({ ...f, includeInDocuments: activeByKey.get(f.key) ?? false })));
}

// Adds a field directly to this event (not synced from an org template --
// use .../participant-fields/sync for that). Also upserts a matching
// MergeVariable row, same auto-link as org-template creation.
export async function POST(
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

  const { key, label, fieldType, options, surfaces, sortOrder, includeInDocuments } = await req.json();
  if (!key || !label || !fieldType) {
    return NextResponse.json({ error: "key, label, and fieldType are required" }, { status: 400 });
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
    return NextResponse.json({ error: "invalid_key" }, { status: 400 });
  }

  const field = await prisma.$transaction(async (tx) => {
    const created = await tx.eventParticipantField.create({
      data: {
        eventId,
        key,
        label,
        fieldType,
        options: options ?? undefined,
        surfaces: surfaces ?? [],
        sortOrder: sortOrder ?? null,
        isFromTemplate: false,
      },
    });
    await tx.mergeVariable.upsert({
      where: { key },
      update: { sourceType: "participant_custom_field", sourceField: key, label, active: includeInDocuments ?? true },
      create: { key, sourceType: "participant_custom_field", sourceField: key, label, active: includeInDocuments ?? true },
    });
    return created;
  });

  return NextResponse.json(field, { status: 201 });
}
