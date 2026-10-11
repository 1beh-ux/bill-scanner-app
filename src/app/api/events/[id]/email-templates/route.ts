import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { isCustomPurpose } from "@/lib/email-template-purpose-keys";
import { cleanName, customStarter, customTemplatesOf, newCustomPurposeKey } from "@/lib/custom-email-templates";

// Own e-mail templates available in this event: the organization's (possibly changed for the
// event) plus the event's own. Text is edited through /api/events/[id]/email-template.
type Ctx = { params: Promise<{ id: string }> };

async function guard(ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return { denied: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) } as const;
  const { id: eventId } = await ctx.params;
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  return denied ? ({ denied } as const) : ({ eventId } as const);
}

export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard(ctx);
  if ("denied" in g) return g.denied;
  return NextResponse.json(await customTemplatesOf(g.eventId));
}

/** A new own template for this event only. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("denied" in g) return g.denied;
  const name = cleanName((await req.json().catch(() => ({}))).name);
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
  const row = await prisma.eventEmailTemplate.create({ data: { eventId: g.eventId, purposeKey: newCustomPurposeKey(), name, ...customStarter(name) }, select: { purposeKey: true, name: true } });
  return NextResponse.json(row, { status: 201 });
}

/** Deletes an own template of this event (an organization template is deleted in Šablony e-mailů). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("denied" in g) return g.denied;
  const purposeKey = req.nextUrl.searchParams.get("purposeKey") ?? "";
  if (!isCustomPurpose(purposeKey)) return NextResponse.json({ error: "not_custom" }, { status: 400 });
  await prisma.eventEmailTemplate.deleteMany({ where: { eventId: g.eventId, purposeKey, name: { not: null } } });
  return NextResponse.json({ ok: true });
}
