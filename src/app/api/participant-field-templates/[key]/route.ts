import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PORTAL_ACCESS_LEVELS } from "@/lib/portal-rules";
import { FIELD_AUDIENCES, FIELD_LEVELS } from "@/lib/registration-fields";
import { notFound } from "@/lib/org-scope";
import { templateScope } from "@/lib/template-scope";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  // The acting organization's template, or with ?level=app an app template (super-admin).
  const scope = await templateScope(req, user, true);
  if ("error" in scope) return scope.error;

  const { key } = await params;
  const decodedKey = decodeURIComponent(key);
  // Keys are unique per organization (organizations step 4); another organization's template doesn't exist here.
  const current = await prisma.participantFieldTemplate.findFirst({ where: { key: decodedKey, organizationId: scope.organizationId }, select: { id: true } });
  if (!current) return notFound();
  const body = await req.json();
  const { key: newKey, label, fieldType, options, defaultSurfaces, active, portalAccess, requiredInRegistration, audience, level } = body;
  if (requiredInRegistration !== undefined && typeof requiredInRegistration !== "boolean") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  // Parent portal rule (child profiles) -- see PortalAccess in the schema.
  if (portalAccess !== undefined && !PORTAL_ACCESS_LEVELS.includes(portalAccess)) {
    return NextResponse.json({ error: "bad_portal_access" }, { status: 400 });
  }
  // Who the field is for + basic/detailed (slice 5 #1).
  if ((audience !== undefined && !FIELD_AUDIENCES.includes(audience)) || (level !== undefined && !FIELD_LEVELS.includes(level))) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Renaming only touches this org template -- it never retroactively
  // renames already-synced EventParticipantField rows (sync only adds
  // missing keys, same as everywhere else), so it's safe with no data
  // migration, unlike the event-scope rename in .../participant-fields/[fieldId].
  if (newKey !== undefined && newKey !== decodedKey) {
    if (typeof newKey !== "string" || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(newKey)) {
      return NextResponse.json({ error: "invalid_key" }, { status: 400 });
    }
    const conflict = await prisma.participantFieldTemplate.findFirst({ where: { key: newKey, organizationId: scope.organizationId }, select: { id: true } });
    if (conflict) {
      return NextResponse.json({ error: "key_taken" }, { status: 409 });
    }
  }

  const template = await prisma.participantFieldTemplate.update({
    where: { id: current.id },
    data: {
      ...(newKey !== undefined && newKey !== decodedKey && { key: newKey }),
      ...(label !== undefined && { label }),
      ...(fieldType !== undefined && { fieldType }),
      ...(options !== undefined && { options }),
      ...(defaultSurfaces !== undefined && { defaultSurfaces }),
      ...(active !== undefined && { active }),
      ...(portalAccess !== undefined && { portalAccess }),
      ...(requiredInRegistration !== undefined && { requiredInRegistration }),
      ...(audience !== undefined && { audience }),
      ...(level !== undefined && { level }),
    },
  });

  return NextResponse.json(template);
}

// Deletes the org template only -- events that already synced this field
// keep their own EventParticipantField row (same as deleting a
// CategoryTemplate/ListTemplate doesn't touch events that already synced
// it), including its own `documents`/`import` surfaces and any
// customFieldValues already saved under this key.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  // The acting organization's template, or with ?level=app an app template (super-admin).
  const scope = await templateScope(req, user, true);
  if ("error" in scope) return scope.error;

  const { key } = await params;
  // Another organization's template doesn't exist here.
  const current = await prisma.participantFieldTemplate.findFirst({ where: { key: decodeURIComponent(key), organizationId: scope.organizationId }, select: { id: true } });
  if (!current) return notFound();
  await prisma.participantFieldTemplate.delete({ where: { id: current.id } });

  return NextResponse.json({ ok: true });
}
