import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess, requireModuleAccess } from "@/lib/module-access";
import { healthNotesConfig, saveHealthNotesConfig } from "@/lib/health-notes-server";

// Zdravotní poznámky setting (Nastavení akce -> Zdraví). Read by the settings
// block and the participant detail (which groups the health fields).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;
  const [event, fields] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { healthNotes: true } }),
    prisma.eventParticipantField.findMany({ where: { eventId, active: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
  ]);
  return NextResponse.json({
    ...healthNotesConfig(event, fields),
    fields: fields.filter((f) => f.fieldType !== "image" && f.computedType !== "payment_qr_image").map((f) => ({ key: f.key, label: f.label, kind: f.kind })),
  });
}

/** Saves the setting (and syncs the custom fields' health surfaces, see saveHealthNotesConfig). */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "health");
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const config = await saveHealthNotesConfig(eventId, body.config);
  return NextResponse.json({ config, isDefault: false });
}
