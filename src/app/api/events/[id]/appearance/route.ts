import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { isOrgAdmin, requireEventInOrg } from "@/lib/org-scope";
import { cleanLayer, layered, readLayer } from "@/lib/public-appearance";

// Nastavení akce -> Veřejná přihláška -> Vzhled: this event's own layer over the organization's look of
// the standalone registration page (src/lib/public-appearance.ts pageAppearance). The same people as
// the rest of that tab: admins, Účastníci / Vstupenky.
async function guard(eventId: string) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (isOrgAdmin(user)) return requireEventInOrg(user, eventId).then((r) => ("error" in r ? r.error : null));
  return requireAnyModuleAccess(user, eventId, ["participants", "tickets"]);
}

async function view(eventId: string) {
  const e = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { appearance: true, organization: true } });
  // What the page looks like without the event's own choices (preview + "as the organization" labels).
  return { inherited: layered(e.organization, readLayer(e.organization.appearanceRegistration)), layer: readLayer(e.appearance) };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guard(id);
  if (denied) return denied;
  return NextResponse.json(await view(id));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guard(id);
  if (denied) return denied;
  const l = cleanLayer(((await req.json().catch(() => ({}))) as { values?: unknown }).values);
  if (!l) return NextResponse.json({ error: "bad_value" }, { status: 400 });
  await prisma.event.update({ where: { id }, data: { appearance: Object.keys(l).length ? (l as Prisma.InputJsonObject) : Prisma.DbNull } });
  return NextResponse.json(await view(id));
}
