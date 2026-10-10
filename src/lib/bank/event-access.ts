import { NextResponse } from "next/server";
import type { Event } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { notFound } from "@/lib/org-scope";

/** Event bank routes: module access as for the roster (health or mail) and the event in the acting organization. */
export async function requireEventBank(eventId: string): Promise<{ error: NextResponse } | { userId: string; event: Event }> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return { error: denied };
  return { userId: user.id, event: await prisma.event.findUniqueOrThrow({ where: { id: eventId } }) };
}

/** A movement of the event's account (review / ignored ones are the event's to decide), else 404. */
export async function eventMovement(event: Event, movementRowId: string) {
  const m = event.bankAccountId ? await prisma.bankMovement.findFirst({ where: { id: movementRowId, bankAccountId: event.bankAccountId } }) : null;
  return m ?? notFound();
}
