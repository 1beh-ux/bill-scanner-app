import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { allowedParticipantFieldKeys, requireAnyModuleAccess } from "@/lib/module-access";
import { answerKey, bulkAnswer, distinctAnswers } from "@/lib/bulk-answers";
import { updateProfile } from "@/lib/child-profile";
import { profileValues } from "@/lib/portal-rules";

// Hromadná úprava odpovědí (src/lib/bulk-answers.ts). GET ?fieldKey= -> the field's distinct answers;
// POST { fieldKey, answers: string[], replacement: string | null, profiles: boolean } -> the picked answers
// cleared (null) or replaced, in this event's participants and (profiles) the same answer in their Členové
// profile, which then also reaches their other connected events.
async function guard(req: NextRequest, eventId: string, fieldKey: unknown) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const denied = await requireAnyModuleAccess(user, eventId, ["participants", "health", "mail"]);
  if (denied) return { error: denied };
  const field = typeof fieldKey === "string" ? await prisma.eventParticipantField.findFirst({ where: { eventId, key: fieldKey, kind: "custom", active: true } }) : null;
  // Only a stored answer (not composite / image) the user may see.
  if (!field || field.fieldType === "composite" || field.fieldType === "image" || !(await allowedParticipantFieldKeys(user, eventId)).has(field.key)) {
    return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  }
  return { field };
}

const answersOf = (eventId: string) => prisma.participant.findMany({ where: { eventId }, select: { id: true, childId: true, customFieldValues: true } });

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(req, id, req.nextUrl.searchParams.get("fieldKey"));
  if ("error" in g) return g.error;
  const rows = await answersOf(id);
  return NextResponse.json({ answers: distinctAnswers(rows.map((r) => (r.customFieldValues as Record<string, string> | null)?.[g.field.key])) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { fieldKey?: unknown; answers?: unknown; replacement?: unknown; profiles?: unknown };
  const g = await guard(req, id, body.fieldKey);
  if ("error" in g) return g.error;
  const key = g.field.key;
  const picked = new Set((Array.isArray(body.answers) ? body.answers : []).filter((a): a is string => typeof a === "string").map(answerKey));
  const replacement = typeof body.replacement === "string" ? body.replacement.trim().slice(0, 2000) || null : null;
  if (picked.size === 0) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  let participants = 0;
  const people = new Set<string>();
  for (const p of await answersOf(id)) {
    const values = (p.customFieldValues as Record<string, string> | null) ?? {};
    const next = bulkAnswer(values[key], picked, replacement);
    if (next === values[key]) continue;
    const { [key]: _old, ...rest } = values;
    void _old;
    await prisma.participant.update({ where: { id: p.id }, data: { customFieldValues: next ? { ...rest, [key]: next } : rest } });
    participants++;
    if (p.childId) people.add(p.childId);
  }
  // The same answer in the person's profile (organization field of that key), changed the same way.
  let profiles = 0;
  if (body.profiles === true && people.size) {
    const template = await prisma.participantFieldTemplate.findFirst({ where: { key, organization: { events: { some: { id } } } }, select: { id: true } });
    if (template) {
      for (const child of await prisma.child.findMany({ where: { id: { in: [...people] } } })) {
        const current = profileValues(child)[key];
        const next = bulkAnswer(current, picked, replacement);
        if (next === current) continue;
        await updateProfile(child.id, { [key]: next ?? "" });
        profiles++;
      }
    }
  }
  return NextResponse.json({ participants, profiles });
}
