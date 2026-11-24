// Use-case test "Registrace 2027" (STAGING ONLY, 2026-11-24) -- docs/test-cases/registrace-2027/README.md.
// Creates (once; re-running keeps what exists) in the organization Pionýrská skupina Záře:
//   - document templates "Registrační list (TEST)" (platí trvale) and "Platba (TEST)"
//   - event "TEST Členství 2026"  (membership year, the base the member list is imported into)
//   - event "TEST Registrace 2027" (membership year; portal open for the 2026 members; accepted automatically;
//     documents: the registration list (covered by the person's document) + the payment document)
// Prints names and counts only.
//   bash scripts/staging/run-staging-db.sh npx tsx scripts/staging/setup-registrace-test.ts
async function main() {
  if (process.env.APP_ENV !== "staging" || !/@127\.0\.0\.1:55440\//.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: not the staging DB");
  const { prisma } = await import("../../src/lib/prisma");
  if (!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }))) throw new Error("refusing: no staging marker");
  const { createEventWithDefaults } = await import("../../src/lib/event-create");
  const org = await prisma.organization.findFirstOrThrow({ where: { name: "Pionýrská skupina Záře" } });

  // Document templates of the organization.
  const template = async (key: string, name: string, data: object) =>
    (await prisma.listTemplate.findFirst({ where: { organizationId: org.id, kind: "document", key } })) ??
    prisma.listTemplate.create({ data: { organizationId: org.id, kind: "document", key, name, data, sortOrder: 900 } });
  await template("test_registracni_list", "Registrační list (TEST)", { permanent: true, displayName: "Registrační list" });
  await template("test_platba", "Platba (TEST)", { displayName: "Platba členského příspěvku" });

  const event = async (name: string, start: string, end: string, extra: Record<string, unknown>) => {
    const found = await prisma.event.findFirst({ where: { organizationId: org.id, name } });
    if (found) return { event: found, created: false };
    const e = await createEventWithDefaults({ name, startDate: start, endDate: end, organizationId: org.id, isPublic: false });
    const updated = await prisma.event.update({ where: { id: e.id }, data: { kind: "membership", ...extra } });
    return { event: updated, created: true };
  };
  // A document type of the event with the template's key (the person's permanent document covers it).
  const docType = async (eventId: string, key: string, name: string) =>
    (await prisma.eventListItem.findFirst({ where: { eventId, kind: "document", key } })) ??
    prisma.eventListItem.create({ data: { eventId, kind: "document", key, name, isFromTemplate: true, sortOrder: 900 } });

  const y2026 = await event("TEST Členství 2026", "2026-01-01", "2026-12-31", { peopleLinkMode: "all", status: "active" });
  await docType(y2026.event.id, "test_registracni_list", "Registrační list (TEST)");

  const y2027 = await event("TEST Registrace 2027", "2027-01-01", "2027-12-31", {
    peopleLinkMode: "existing",
    portalOpen: true,
    eligibility: { attendedEventIds: [y2026.event.id] },
    autoAccept: "accept",
    memberPriceCzk: 600,
    nonMemberPriceCzk: 600,
    registrationDeadline: new Date("2027-01-31"),
    portalInfo: "Členský příspěvek na rok 2027. Registrační list už máme – stačí potvrdit údaje a zaplatit.",
    publicRegistration: true,
    publicSlug: "test-registrace-2027",
    status: "active",
  });
  await docType(y2027.event.id, "test_registracni_list", "Registrační list (TEST)");
  const pay = await docType(y2027.event.id, "test_platba", "Platba (TEST)");
  await prisma.event.update({ where: { id: y2027.event.id }, data: { paymentDocTypeId: pay.id } });

  const count = async (id: string) => ({
    fields: await prisma.eventParticipantField.count({ where: { eventId: id } }),
    documentTypes: await prisma.eventListItem.count({ where: { eventId: id, kind: "document", active: true } }),
    participants: await prisma.participant.count({ where: { eventId: id } }),
  });
  console.log(JSON.stringify({
    organization: org.name,
    "TEST Členství 2026": { created: y2026.created, id: y2026.event.id, ...(await count(y2026.event.id)) },
    "TEST Registrace 2027": { created: y2027.created, id: y2027.event.id, slug: "test-registrace-2027", ...(await count(y2027.event.id)) },
  }, null, 1));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exit(1); });
export {};
