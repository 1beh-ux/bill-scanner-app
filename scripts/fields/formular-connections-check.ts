// STAGING check of the Formulář build of 2026-11-26 on one event: field connections on every row, the organization's
// "required" default and its propagation, a question moved to Osoba + reordered, a new guardian field (form, public
// form context, validation, documents). Everything it touches is saved first and put back at the end.
//   bash scripts/staging/run-staging-db.sh npx tsx scripts/fields/formular-connections-check.ts "TEST Registrace 2027"
async function main() {
  if (process.env.APP_ENV !== "staging" || !/@127\.0\.0\.1:55440\//.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: not the staging DB");
  const { prisma } = await import("../../src/lib/prisma");
  if (!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }))) throw new Error("refusing: no staging marker");
  const { Prisma } = await import("../../src/generated/prisma");
  const fs = await import("../../src/lib/form-structure");
  const gs = await import("../../src/lib/guardian-fields-server");
  const { publicFormContext } = await import("../../src/lib/public-registration-server");
  const { validateSubmission } = await import("../../src/lib/public-registration");
  const { loadResolverContext, invalidateResolverContext, classifyKey } = await import("../../src/lib/field-resolver");

  const event = await prisma.event.findFirstOrThrow({ where: { name: process.argv[2] } });
  const orgId = event.organizationId;
  const saved = {
    fields: await prisma.eventParticipantField.findMany({ where: { event: { organizationId: orgId } }, select: { id: true, formConfig: true, requiredOnRegistration: true, active: true } }),
    templates: await prisma.participantFieldTemplate.findMany({ where: { organizationId: orgId }, select: { id: true, requiredInRegistration: true } }),
    guardianProps: (await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { guardianProps: true } })).guardianProps,
    guardianForm: event.guardianForm,
  };
  const out: Record<string, unknown> = {};
  const fail: string[] = [];
  const ok = (name: string, v: boolean) => {
    out[name] = v;
    if (!v) fail.push(name);
  };
  try {
    // 1. Every row of the person / guardian sections and every question says which field it fills.
    let f = await fs.formStructure(event.id);
    const rows = f.sections.flatMap((s) => s.rows);
    const person = f.sections.find((s) => s.id === "person")!.rows;
    ok("personRowsConnected", person.filter((r) => r.kind === "text").every((r) => "field" in r && !!r.field));
    ok("firstNameFillsField", person.some((r) => r.kind === "text" && r.field?.key === "participant_first_name"));
    ok("questionsConnected", rows.filter((r) => r.kind === "question").every((r) => r.kind === "question" && r.field.key === r.key));
    ok("guardianRowsConnected", f.sections.find((s) => s.id === "guardians")!.rows.every((r) => "field" in r && !!r.field));

    // 2. Organization default of a question asked here: the event follows while it had the old default.
    const q = rows.find((r): r is Extract<typeof r, { kind: "question" }> => r.kind === "question" && r.requiredDefault !== null);
    if (!q) throw new Error("no organization question asked on this form");
    await fs.changeQuestion(event.id, q.key, { required: q.requiredDefault }); // converted, same as the organization
    await fs.setOrgRequired(orgId, q.key, !q.requiredDefault);
    f = await fs.formStructure(event.id);
    const q2 = f.sections.flatMap((s) => s.rows).find((r) => r.kind === "question" && r.key === q.key) as typeof q;
    ok("orgDefaultFollowed", q2.cfg.required === !q.requiredDefault && q2.requiredDefault === !q.requiredDefault);
    await fs.changeQuestion(event.id, q.key, { required: q.requiredDefault }); // set by hand -> differs
    await fs.setOrgRequired(orgId, q.key, q.requiredDefault); // back: equals the event again
    await fs.setOrgRequired(orgId, q.key, !q.requiredDefault); // this event was the old default -> follows
    f = await fs.formStructure(event.id);
    ok("orgDefaultFollowedAgain", (f.sections.flatMap((s) => s.rows).find((r) => r.kind === "question" && r.key === q.key) as typeof q).cfg.required === !q.requiredDefault);

    // 3. Moved to Osoba and ordered: on the Formulář screen and in the public form context.
    const qs = f.sections.find((s) => s.id === "questions")!.rows.filter((r) => r.kind === "question").map((r) => (r as typeof q).key);
    if (qs.length >= 2) {
      await fs.changeQuestion(event.id, qs[0], { place: "person" });
      await fs.reorderQuestions(event.id, "questions", [qs[qs.length - 1], ...qs.slice(1, -1)]);
      f = await fs.formStructure(event.id);
      ok("movedToPerson", f.sections.find((s) => s.id === "person")!.rows.some((r) => r.kind === "question" && r.key === qs[0]));
      ok("reordered", (f.sections.find((s) => s.id === "questions")!.rows[0] as typeof q).key === qs[qs.length - 1]);
      const ctx = await publicFormContext(event as never);
      ok("publicPlacePerson", ctx.fields.find((x) => x.key === qs[0])?.place === "person");
      const keys = ctx.fields.map((x) => x.key);
      ok("publicOrder", keys.indexOf(qs[qs.length - 1]) < keys.indexOf(qs[1]));
    }

    // 4. A new guardian field: on the form for every guardian, required, in the public form, in documents.
    await gs.createGuardianField(orgId, { key: "souhlas_check", label: "Souhlas (kontrola)", fieldType: "consent", required: true });
    f = await fs.formStructure(event.id);
    ok("guardianRowShown", f.sections.find((s) => s.id === "guardians")!.rows.some((r) => r.kind === "guardian" && r.key === "souhlas_check" && r.required));
    const fresh = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    const ctx = await publicFormContext(fresh as never);
    ok("publicGuardianQuestion", ctx.guardians.some((x) => x.key === "souhlas_check" && x.required));
    const child = { firstName: "Test", lastName: "Kontrola", birthDate: "2016-01-01", values: {} };
    const v1 = validateSubmission({ persons: [child], guardians: [{ name: "Z", email: "z@example.invalid", phone: "777 777 777", relationship: "matka" }] }, { ...ctx, today: new Date() });
    ok("consentRequired", !v1.ok && v1.errors.includes("g0.souhlas_check"));
    await gs.changeGuardianQuestion(event.id, "souhlas_check", { required: false });
    f = await fs.formStructure(event.id);
    const gr = f.sections.find((s) => s.id === "guardians")!.rows.find((r) => r.kind === "guardian" && r.key === "souhlas_check") as Extract<(typeof rows)[number], { kind: "guardian" }>;
    ok("eventDiffers", !gr.required && gr.requiredDefault);
    invalidateResolverContext();
    const rctx = await loadResolverContext(event.id);
    ok("documentKey", classifyKey("guardian2_souhlas_check", rctx, new Set()).kind === "guardian");
  } finally {
    for (const x of saved.fields) await prisma.eventParticipantField.update({ where: { id: x.id }, data: { formConfig: x.formConfig === null ? Prisma.DbNull : (x.formConfig as object), requiredOnRegistration: x.requiredOnRegistration, active: x.active } });
    for (const x of saved.templates) await prisma.participantFieldTemplate.update({ where: { id: x.id }, data: { requiredInRegistration: x.requiredInRegistration } });
    await prisma.organization.update({ where: { id: orgId }, data: { guardianProps: saved.guardianProps === null ? Prisma.DbNull : (saved.guardianProps as object) } });
    await prisma.event.update({ where: { id: event.id }, data: { guardianForm: saved.guardianForm === null ? Prisma.DbNull : (saved.guardianForm as object) } });
    out.restored = true;
  }
  console.log(JSON.stringify({ ...out, failed: fail }, null, 1));
  if (fail.length) process.exit(1);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exit(1); });
export {};
