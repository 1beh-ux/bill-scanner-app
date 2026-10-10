// Who owns a new org-level row (docs/organizations-change-notes.md): the
// event's organization inside an event, else the creating user's. Every create
// in the 13 owned tables goes through one of these. No read filtering yet.
import { prisma } from "@/lib/prisma";
import type { PrismaClient, User } from "@/generated/prisma";

export async function orgIdOfEvent(eventId: string) {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { organizationId: true } });
  return event.organizationId;
}

export const orgIdOfUser = (user: Pick<User, "organizationId">) => user.organizationId;

/** Seeds and test scripts: SEED_ORGANIZATION (default "Pionýrská skupina Záře"), created if missing (a fresh dev DB). */
export async function orgIdForSeeds(db: Pick<PrismaClient, "organization"> = prisma): Promise<string> {
  const name = process.env.SEED_ORGANIZATION || "Pionýrská skupina Záře";
  const org = (await db.organization.findFirst({ where: { name }, select: { id: true } })) ?? (await db.organization.create({ data: { name, shortName: name }, select: { id: true } }));
  return org.id;
}
