// What the round-2 rules mean for a real organization (STAGING ONLY, run on the production copy). Field keys and
// counts only -- no names, no values.
//   bash scripts/staging/run-staging-db.sh npx tsx scripts/fields/rules-impact.ts <orgIdPrefix>
async function main() {
  if (process.env.APP_ENV !== "staging" || !/@127\.0\.0\.1:55440\//.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: not the staging DB");
  const { prisma } = await import("../../src/lib/prisma");
  if (!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }))) throw new Error("refusing: no staging marker");
  const { buildOverview, countValues } = await import("../../src/lib/fields-overview");
  const { fieldHints } = await import("../../src/lib/field-hints");
  const { duplicateProposals, SUGGESTED_GROUPS, CODE_READERS } = await import("../../src/lib/field-merge");
  const { SYSTEM_KEYS } = await import("../../src/lib/org-locked");
  const { readSyncs } = await import("../../src/lib/participant-sync");
  const { readProfileSections } = await import("../../src/lib/portal-rules");
  const { contactEmail, RECOMMENDED_RULE } = await import("../../src/lib/contact-email");
  const { resolveContactEmail } = await import("../../src/lib/document-variables");
  const { fullNameFrom } = await import("../../src/lib/participant-name");

  const org = await prisma.organization.findFirstOrThrow({ where: { id: { startsWith: process.argv[2] ?? "-" } } });
  const out: string[] = [];
  const say = (s: string) => out.push(s);
  const templates = await prisma.participantFieldTemplate.findMany({ where: { organizationId: org.id } });
  const aliases = await prisma.fieldAlias.findMany({ where: { organizationId: org.id } });
  const children = await prisma.child.findMany({ where: { organizationId: org.id }, select: { fieldValues: true } });
  const events = await prisma.event.findMany({ where: { organizationId: org.id }, orderBy: { startDate: "asc" } });

  say(`ORG ${org.name}: ${templates.length} templates (${templates.filter((t) => !t.active).length} inactive), ${events.length} events, ${children.length} people, ${aliases.length} aliases`);
  say(`templates stored on the registration only ("Ukládat i do profilu" off): ${templates.filter((t) => t.storage === "event").map((t) => t.key).join(", ") || "none"}`);
  say(`templates in the portal: ${templates.filter((t) => t.portalAccess !== "hidden").length} (basic ${templates.filter((t) => t.portalAccess !== "hidden" && t.level === "basic").length}, detailed ${templates.filter((t) => t.portalAccess !== "hidden" && t.level === "detailed").length})`);
  say(`templates required by default: ${templates.filter((t) => t.requiredInRegistration).map((t) => t.key).join(", ") || "none"}`);
  const keys = new Set(templates.map((t) => t.key));
  say(`agreed duplicate groups present: ${SUGGESTED_GROUPS.map((g) => `${g.id}[${g.keys.filter((k) => keys.has(k)).join(",")}]`).join(" ")}`);
  say(`proposed duplicates (automatic): ${(await duplicateProposals(org.id)).map((p) => p.keys.join("≈")).join(" | ") || "none"}`);
  say(`keys code reads directly, present: ${Object.keys(CODE_READERS).filter((k) => keys.has(k)).join(", ") || "none"}`);
  const kitchen = await prisma.eventKitchenSettings.findMany({ where: { event: { organizationId: org.id }, allergyFieldKey: { not: null } }, select: { allergyFieldKey: true } });
  say(`kitchen allergy setting: ${kitchen.map((k) => k.allergyFieldKey).join(", ") || "default (alergie / allergies)"}`);

  for (const e of events) {
    const fields = await prisma.eventParticipantField.findMany({ where: { eventId: e.id } });
    const participants = await prisma.participant.findMany({ where: { eventId: e.id }, select: { name: true, firstName: true, lastName: true, groupName: true, isAdult: true, customFieldValues: true, guardians: { select: { email: true, receivesCommunications: true } } } });
    const ov = buildOverview({
      templates: templates as never,
      eventFields: fields as never,
      syncs: readSyncs(e.participantSyncs),
      aliases,
      profileSections: readProfileSections((await prisma.organization.findUniqueOrThrow({ where: { id: org.id }, select: { portalProfileSections: true } })).portalProfileSections),
      profileCounts: countValues(children.map((c) => c.fieldValues as Record<string, unknown> | null)),
      registrationCounts: countValues(participants.map((p) => p.customFieldValues as Record<string, unknown> | null)),
      publicRegistration: e.publicRegistration,
      systemKeys: SYSTEM_KEYS,
      lockedKeys: new Set(),
    });
    const missingSystem = [...SYSTEM_KEYS].filter((k) => !fields.some((f) => f.key === k));
    const inactiveSystem = fields.filter((f) => SYSTEM_KEYS.has(f.key) && !f.active).map((f) => f.key);
    const hints = new Map<string, string[]>();
    for (const f of ov.fields) for (const h of fieldHints(f, ov.fields, null)) hints.set(h.id, [...(hints.get(h.id) ?? []), f.key]);
    const nameMismatch = participants.filter((p) => (p.firstName || p.lastName) && fullNameFrom(p.firstName, p.lastName) !== p.name).length;
    const nameOnly = participants.filter((p) => !p.firstName && !p.lastName && p.name).length;
    const noMailToday = participants.filter((p) => !resolveContactEmail(p)).length;
    const emailKeys = fields.filter((f) => f.fieldType === "email").map((f) => f.key);
    const noMailRule = participants.filter((p) => !contactEmail(RECOMMENDED_RULE, { guardians: p.guardians, customFieldValues: p.customFieldValues as Record<string, string> | null }, !!p.isAdult, emailKeys)).length;
    const syncs = readSyncs(e.participantSyncs);
    const legacyGuardianCols = syncs.reduce((n, s) => n + Object.values(s.mapping).filter((v) => ["zast_jmeno", "zak_zast_jmeno", "vztah", "zast_telefon", "Email"].includes(v)).length, 0);
    const docTypes = await prisma.eventListItem.count({ where: { eventId: e.id, kind: "document", data: { path: ["templateGoogleDocId"], not: "null" } } });
    say(
      [
        `\nEVENT ${e.name} (${e.startDate.toISOString().slice(0, 10)}): ${participants.length} participants, ${fields.length} fields (${fields.filter((f) => !f.active).length} inactive), public form ${e.publicRegistration ? "on" : "off"}`,
        `  system fields missing: ${missingSystem.join(", ") || "none"} | switched off: ${inactiveSystem.join(", ") || "none"}`,
        `  full name differs from first+last: ${nameMismatch} | name without first/last: ${nameOnly} | with a group (Skupina): ${participants.filter((p) => p.groupName).length}`,
        `  contact e-mail missing: today ${noMailToday}, recommended rule ${noMailRule}`,
        `  connections: ${syncs.length} (${syncs.filter((s) => s.autoSync).length} automatic), old guardian columns to become slots: ${legacyGuardianCols}`,
        `  document types with a Google Docs template: ${docTypes} (production Drive -- not readable from staging)`,
        `  hints: ${[...hints].map(([id, ks]) => `${id}[${ks.join(",")}]`).join(" ") || "none"}`,
      ].join("\n"),
    );
  }
  console.log(out.join("\n"));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exit(1); });
export {};
