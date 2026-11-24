// STAGING ONLY: an event's fields (keys / types / flags, no values) -- for debugging the Fields Manager.
async function main() {
  if (process.env.APP_ENV !== "staging" || !/@127\.0\.0\.1:55440\//.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: not the staging DB");
  const { prisma } = await import("../../src/lib/prisma");
  const e = await prisma.event.findFirstOrThrow({ where: { name: process.argv[2] }, select: { id: true, kind: true, publicSlug: true, publicRegistration: true, status: true } });
  console.log(JSON.stringify(e));
  const f = await prisma.eventParticipantField.findMany({ where: { eventId: e.id }, select: { key: true, kind: true, fieldType: true, active: true, isFromTemplate: true, surfaces: true, requiredOnRegistration: true } });
  for (const x of f) console.log(JSON.stringify(x));
  const { ticketFormFields } = await import("../../src/lib/ticket-fields-server");
  console.log("ticket form fields:", (await ticketFormFields(e.id)).map((x) => x.key).join(", ") || "none");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
export {};
