// Open item 1 check (STAGING ONLY): a template set to "Jen přihláška" (storage event) is asked on the public form as
// registration-only, i.e. not written into the profile; back to "profile" it is a profile field again. Prints flags.
//   bash scripts/staging/run-staging-db.sh npx tsx scripts/fields/storage-check.ts
async function main() {
  if (process.env.APP_ENV !== "staging" || !/@127\.0\.0\.1:55440\//.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: not the staging DB");
  const { prisma } = await import("../../src/lib/prisma");
  if (!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }))) throw new Error("refusing: no staging marker");
  const { publicFormContext } = await import("../../src/lib/public-registration-server");
  const event = await prisma.event.findFirstOrThrow({ where: { publicSlug: "staging-tabor-2027" } });
  const t = await prisma.participantFieldTemplate.findFirstOrThrow({ where: { organizationId: event.organizationId, key: "tricko" } });
  const eventOnly = async () => (await publicFormContext(event as never)).fields.find((f) => f.key === "tricko")?.eventOnly ?? false;
  try {
    await prisma.participantFieldTemplate.update({ where: { id: t.id }, data: { storage: "profile" } });
    const asProfile = await eventOnly();
    await prisma.participantFieldTemplate.update({ where: { id: t.id }, data: { storage: "event" } });
    const asRegistrationOnly = await eventOnly();
    console.log(JSON.stringify({ asked: true, profileStorage_eventOnly: asProfile, registrationOnly_eventOnly: asRegistrationOnly }));
  } finally {
    await prisma.participantFieldTemplate.update({ where: { id: t.id }, data: { storage: t.storage } });
  }
}
main().then(() => process.exit(0)).catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
export {};
