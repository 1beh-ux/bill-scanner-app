// STAGING (owner's request 2026-11-26): the adult contact rule -> "self" (the adult's own contact row) for
// "Kontaktní e-mail" in TEST Registrace 2027 and the calculated "Hlavní kontaktní email" (organization field:
// template + every event copy). Prints counts.
async function main() {
  if (process.env.APP_ENV !== "staging" || !/@127\.0\.0\.1:55440\//.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: not the staging DB");
  const { prisma } = await import("../../src/lib/prisma");
  if (!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }))) throw new Error("refusing: no staging marker");
  const event = await prisma.event.findFirstOrThrow({ where: { name: "TEST Registrace 2027" } });
  const out: Record<string, number> = {};
  for (const f of await prisma.eventParticipantField.findMany({ where: { eventId: event.id, computedType: "contact_email" } })) {
    const o = (f.options as Record<string, unknown> | null) ?? {};
    await prisma.eventParticipantField.update({ where: { id: f.id }, data: { options: { ...o, contactRule: { ...((o.contactRule as object) ?? { guardians: "first_receiving" }), adultSelfField: "self" } } } });
    out.contactEmailRule = (out.contactEmailRule ?? 0) + 1;
  }
  const calc = (o: unknown) => ({ ...(o as object), adult: "self" });
  for (const t of await prisma.participantFieldTemplate.findMany({ where: { organizationId: event.organizationId, key: "hlavni_kontaktni_email" } })) {
    await prisma.participantFieldTemplate.update({ where: { id: t.id }, data: { options: calc(t.options) } });
    out.calcTemplate = (out.calcTemplate ?? 0) + 1;
  }
  for (const f of await prisma.eventParticipantField.findMany({ where: { key: "hlavni_kontaktni_email", event: { organizationId: event.organizationId } } })) {
    await prisma.eventParticipantField.update({ where: { id: f.id }, data: { options: calc(f.options) } });
    out.calcEventCopies = (out.calcEventCopies ?? 0) + 1;
  }
  console.log(JSON.stringify(out));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exit(1); });
export {};
