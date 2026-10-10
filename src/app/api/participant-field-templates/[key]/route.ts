import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PORTAL_ACCESS_LEVELS } from "@/lib/portal-rules";
import { FIELD_AUDIENCES, FIELD_LEVELS } from "@/lib/registration-fields";
import { isOrgAdmin, notFound, orgWhere } from "@/lib/org-scope";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isOrgAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { key } = await params;
  const decodedKey = decodeURIComponent(key);
  if (!(await prisma.participantFieldTemplate.count({ where: { key: decodedKey, ...(await orgWhere(user)) } }))) return notFound();
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
    const conflict = await prisma.participantFieldTemplate.findUnique({ where: { key: newKey } });
    if (conflict) {
      return NextResponse.json({ error: "key_taken" }, { status: 409 });
    }
  }

  const template = await prisma.participantFieldTemplate.update({
    where: { key: decodedKey },
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
  if (!isOrgAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { key } = await params;
  // Another organization's template doesn't exist here.
  if (!(await prisma.participantFieldTemplate.count({ where: { key: decodeURIComponent(key), ...(await orgWhere(user)) } }))) return notFound();
  await prisma.participantFieldTemplate.delete({ where: { key: decodeURIComponent(key) } });

  return NextResponse.json({ ok: true });
}
