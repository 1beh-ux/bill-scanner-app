import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { parseActivityInput } from "@/lib/planning-activities";

type Params = { params: Promise<{ id: string; activityId: string }> };

async function authorize(params: Params["params"]) {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const { id: eventId, activityId } = await params;
  const denied = await requireModuleAccess(user, eventId, "planning");
  if (denied) return { response: denied };
  const activity = await prisma.planActivity.findFirst({ where: { id: activityId, eventId }, select: { id: true } });
  if (!activity) return { response: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  return { eventId, activityId };
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await authorize(params);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const parsed = await parseActivityInput(auth.eventId, body, true);
  if ("error" in parsed) return NextResponse.json(parsed, { status: 400 });

  const updated = await prisma.planActivity.update({ where: { id: auth.activityId }, data: parsed.data });
  return NextResponse.json(updated);
}

// Scheduled blocks keep their own snapshot of name/categories/leader/location,
// so deleting a library activity only unlinks them (activityId -> null).
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await authorize(params);
  if ("response" in auth) return auth.response;

  await prisma.planActivity.delete({ where: { id: auth.activityId } });
  return NextResponse.json({ ok: true });
}
