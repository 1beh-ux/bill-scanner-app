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
  // The owner's old registration form (Google Doc in "Táborník STAGING / Registrace 2027 – test", old variable names)
  // to try connecting its variables in Pole → Nástroje → Dokumenty.
  const form = await docType(y2026.event.id, "test_registracni_formular", "Registrační list – formulář 2027 (TEST)");
  await prisma.eventListItem.update({ where: { id: form.id }, data: { data: { templateGoogleDocId: "1gEs9tbvNWfViuT407vV75tF4Jbp_LyHg6mBqlIypiYM" } } });

  const y2027 = await event("TEST Registrace 2027", "2027-01-01", "2027-12-31", {
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

  // The same modules as the organization's real membership year "Registrace 2027" (Přihláška, Lidé, Platby...):
  // without the registration module the public page and the portal card stay off.
  const model = await prisma.event.findFirst({ where: { organizationId: org.id, name: "Registrace 2027" }, select: { id: true } });
  const modules = model ? await prisma.eventModule.findMany({ where: { eventId: model.id } }) : [];
  for (const id of [y2026.event.id, y2027.event.id])
    for (const m of modules)
      await prisma.eventModule.upsert({ where: { eventId_moduleKey: { eventId: id, moduleKey: m.moduleKey } }, update: { enabled: m.enabled }, create: { eventId: id, moduleKey: m.moduleKey, enabled: m.enabled } });

  // 2026-11-26: the registration list can also be CREATED (Vytvořit on the participant detail) from the owner's form
  // template -- the signed file handed back is still what counts as received.
  const FORM_DOC = "1gEs9tbvNWfViuT407vV75tF4Jbp_LyHg6mBqlIypiYM";
  for (const id of [y2026.event.id, y2027.event.id]) {
    const item = await prisma.eventListItem.findFirst({ where: { eventId: id, kind: "document", key: "test_registracni_list" } });
    if (item) await prisma.eventListItem.update({ where: { id: item.id }, data: { data: { ...((item.data as object | null) ?? {}), templateGoogleDocId: FORM_DOC } } });
  }

  const count = async (id: string) => ({
    fields: await prisma.eventParticipantField.count({ where: { eventId: id } }),
    documentTypes: await prisma.eventListItem.count({ where: { eventId: id, kind: "document", active: true } }),
    participants: await prisma.participant.count({ where: { eventId: id } }),
    modulesOn: (await prisma.eventModule.findMany({ where: { eventId: id, enabled: true }, select: { moduleKey: true } })).map((m) => m.moduleKey).join(","),
  });
  console.log(JSON.stringify({
    organization: org.name,
    "TEST Členství 2026": { created: y2026.created, id: y2026.event.id, ...(await count(y2026.event.id)) },
    "TEST Registrace 2027": { created: y2027.created, id: y2027.event.id, slug: "test-registrace-2027", ...(await count(y2027.event.id)) },
  }, null, 1));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exit(1); });
export {};
