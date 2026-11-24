// Rethink check (STAGING ONLY): the first Formulář change converts the event without changing what the public form
// asks (except that one change); "reset" brings the form back exactly. Prints keys and flags only.
//   bash scripts/staging/run-staging-db.sh npx tsx scripts/fields/form-convert-check.ts "<event name>"
async function main() {
  if (process.env.APP_ENV !== "staging" || !/@127\.0\.0\.1:55440\//.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: not the staging DB");
  const { prisma } = await import("../../src/lib/prisma");
  if (!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }))) throw new Error("refusing: no staging marker");
  const { Prisma } = await import("../../src/generated/prisma");
  const { publicFormContext } = await import("../../src/lib/public-registration-server");
  const { changeQuestion, resetForm } = await import("../../src/lib/form-structure");

  const event = await prisma.event.findFirstOrThrow({ where: { name: process.argv[2] } });
  const before = await prisma.eventParticipantField.findMany({ where: { eventId: event.id }, select: { id: true, formConfig: true, requiredOnRegistration: true, active: true } });
  const form = async () => (await publicFormContext(event as never)).fields.map((f) => [f.key, f.required, f.audience ?? "both", !!f.eventOnly].join("|"));
  try {
    const legacy = await form();
    const target = legacy[0]?.split("|")[0];
    if (!target) throw new Error("the form asks nothing");
    await changeQuestion(event.id, target, { hint: "Test nápovědy" }); // a change that doesn't alter what is asked
    const converted = await form();
    const same = JSON.stringify(converted) === JSON.stringify(legacy);
    const diff = { onlyInLegacy: legacy.filter((x) => !converted.includes(x)), onlyInConverted: converted.filter((x) => !legacy.includes(x)) };
    await resetForm(event.id);
    const reset = await form();
    console.log(JSON.stringify({ asked: legacy.length, sameAfterConvert: same, ...(same ? {} : diff), sameAfterReset: JSON.stringify(reset) === JSON.stringify(legacy) }, null, 1));
  } finally {
    // Put every field back exactly as it was (formConfig + the two flags the conversion touches).
    for (const b of before) await prisma.eventParticipantField.update({ where: { id: b.id }, data: { formConfig: b.formConfig === null ? Prisma.DbNull : (b.formConfig as object), requiredOnRegistration: b.requiredOnRegistration, active: b.active } });
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exit(1); });
export {};
