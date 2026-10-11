import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { CUSTOM_PURPOSE_PREFIX } from "@/lib/email-template-purpose-keys";

// Own e-mail templates (Poslat e-mail): a new purpose key and a starting text.
export const newCustomPurposeKey = () => `${CUSTOM_PURPOSE_PREFIX}${randomBytes(6).toString("hex")}`;
export const customStarter = (name: string) => ({ subject: name, body: "Dobrý den,\n\n\n\n{{signature}}" });
export const cleanName = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 100) : "");

/** Own templates available in an event: the organization's (maybe changed for the event) + the event's own. */
export async function customTemplatesOf(eventId: string) {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { organizationId: true } });
  const [org, own] = await Promise.all([
    prisma.emailTemplate.findMany({ where: { organizationId: event.organizationId, purposeKey: { startsWith: CUSTOM_PURPOSE_PREFIX } }, select: { purposeKey: true, name: true } }),
    prisma.eventEmailTemplate.findMany({ where: { eventId, purposeKey: { startsWith: CUSTOM_PURPOSE_PREFIX } }, select: { purposeKey: true, name: true } }),
  ]);
  const changed = new Set(own.map((o) => o.purposeKey));
  return [
    ...org.map((o) => ({ purposeKey: o.purposeKey, name: o.name ?? o.purposeKey, eventOnly: false, changed: changed.has(o.purposeKey) })),
    ...own.filter((o) => o.name && !org.some((x) => x.purposeKey === o.purposeKey)).map((o) => ({ purposeKey: o.purposeKey, name: o.name!, eventOnly: true, changed: true })),
  ].sort((a, b) => a.name.localeCompare(b.name, "cs"));
}
