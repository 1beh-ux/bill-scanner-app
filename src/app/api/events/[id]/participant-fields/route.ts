import { NextRequest, NextResponse } from "next/server";
import type { ParticipantFieldSurface } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess, allowedParticipantFieldKeys } from "@/lib/module-access";

const ALLOWED_SURFACES: ParticipantFieldSurface[] = [
  "list",
  "health_list",
  "health_detail",
  "mail_list",
  "documents",
  "import",
];

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

  return NextResponse.json(visible.map((f) => ({ ...f, includeInDocuments: f.surfaces.includes("documents") })));
}

// Adds a field directly to this event (not synced from an org template --
// use .../participant-fields/sync for that).
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

  const { key, label, fieldType, options, surfaces, sortOrder } = await req.json();
  if (!key || !label || !fieldType) {
    return NextResponse.json({ error: "key, label, and fieldType are required" }, { status: 400 });
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
    return NextResponse.json({ error: "invalid_key" }, { status: 400 });
  }

  const field = await prisma.eventParticipantField.create({
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

  return NextResponse.json(field, { status: 201 });
}
