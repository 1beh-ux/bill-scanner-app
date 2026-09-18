import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";

async function loadOwnedField(eventId: string, fieldId: string) {
  const field = await prisma.eventParticipantField.findUnique({ where: { id: fieldId } });
  if (!field || field.eventId !== eventId) return null;
  return field;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fieldId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId, fieldId } = await params;
  const existing = await loadOwnedField(eventId, fieldId);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;

  const body = await req.json();
  const { key, label, fieldType, options, surfaces, sortOrder, active } = body;
  if (label !== undefined && (typeof label !== "string" || !label.trim())) {
    return NextResponse.json({ error: "label_required" }, { status: 400 });
  }
  // builtin/guardian/computed rows are fixed system fields (see
  // src/lib/fixed-participant-fields.ts) -- only where they're shown/used
  // and whether they're active is admin-editable, not their key/type/label.
  if (existing.kind !== "custom" && (key !== undefined || label !== undefined || fieldType !== undefined || options !== undefined)) {
    return NextResponse.json({ error: "fixed_field_not_editable" }, { status: 400 });
  }

  let newKey: string | undefined;
  if (key !== undefined && key !== existing.key) {
    if (typeof key !== "string" || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
      return NextResponse.json({ error: "invalid_key" }, { status: 400 });
    }
    const conflict = await prisma.eventParticipantField.findUnique({ where: { eventId_key: { eventId, key } } });
    if (conflict) {
      return NextResponse.json({ error: "key_taken" }, { status: 409 });
    }
    newKey = key;
  }

  // Renaming a custom field's key means the {{oldKey}} placeholder in any
  // document/email template someone already wrote stops resolving -- that
  // can't be rewritten for them (their templates live in Google Docs), so
  // the client confirms this explicitly before sending `key`. What we can
  // safely carry forward is the *data*: every participant's stored value
  // under the old key, moved to the new one in the same transaction as the
  // rename so nothing is ever briefly duplicated or lost.
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.eventParticipantField.update({
      where: { id: fieldId },
      data: {
        ...(newKey !== undefined && { key: newKey }),
        ...(label !== undefined && { label: label.trim() }),
        ...(fieldType !== undefined && { fieldType }),
        ...(options !== undefined && { options }),
        ...(surfaces !== undefined && { surfaces }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(active !== undefined && { active }),
      },
    });
    if (newKey !== undefined) {
      const participants = await tx.participant.findMany({
        where: { eventId },
        select: { id: true, customFieldValues: true },
      });
      for (const p of participants) {
        const values = p.customFieldValues as Record<string, string> | null;
        if (!values || !(existing.key in values)) continue;
        const { [existing.key]: value, ...rest } = values;
        await tx.participant.update({
          where: { id: p.id },
          data: { customFieldValues: { ...rest, [newKey]: value } },
        });
      }
    }
    return result;
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fieldId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId, fieldId } = await params;
  const existing = await loadOwnedField(eventId, fieldId);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;
  if (existing.kind !== "custom") {
    return NextResponse.json({ error: "fixed_field_not_deletable" }, { status: 400 });
  }

  // Unlike EventListItem (referenced by ParticipantDocument's FK), nothing
  // references EventParticipantField by foreign key -- values live in
  // Participant.customFieldValues, a plain JSON blob keyed by field key, so
  // there's no constraint to trip here.
  await prisma.eventParticipantField.delete({ where: { id: fieldId } });
  return NextResponse.json({ ok: true });
}
