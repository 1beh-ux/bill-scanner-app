import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/public-host";

// "Ještě nejsem členem organizace – registrovat" on the portal's sign-in screens (2026-10-23): the
// organization's own web address, else the chosen event's public registration page. Null = no button.
export async function portalJoinHref(org: { id: string; portalJoinUrl: string | null; portalJoinEventId: string | null }): Promise<string | null> {
  if (org.portalJoinUrl) return org.portalJoinUrl;
  if (!org.portalJoinEventId) return null;
  const e = await prisma.event.findFirst({ where: { id: org.portalJoinEventId, organizationId: org.id, publicRegistration: true, publicSlug: { not: null }, AND: [{ OR: [{ kind: "public_event" }, { modules: { some: { moduleKey: "registration", enabled: true } } }] }] }, select: { id: true, publicSlug: true } });
  return e ? publicUrl("registration", e.id, `/r/${e.publicSlug}`, org.id) : null;
}
