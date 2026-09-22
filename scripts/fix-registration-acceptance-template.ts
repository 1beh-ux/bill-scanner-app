// One-off, safe to re-run: replaces the still-placeholder registration-acceptance
// e-mail text (Part 11-A/11-I of the participants/settings prompt: "[PLACEHOLDER:
// text a přílohy doladíme později]") with the real default. Only touches rows that
// still contain the literal "[PLACEHOLDER" marker -- anyone who already wrote their
// own wording (with or without that marker surviving into their edit) keeps it,
// UNLESS it's an exact match of the old placeholder text, in which case it's
// clearly nobody's real customization and gets replaced too. Covers both the
// org-wide default (EmailTemplate) and any per-event override
// (EventEmailTemplate) that still has it.
//
//   npx tsx scripts/fix-registration-acceptance-template.ts            # dry run
//   npx tsx scripts/fix-registration-acceptance-template.ts --apply
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

const PURPOSE_KEY = "registration_acceptance";
const PLACEHOLDER_MARKER = "[PLACEHOLDER";

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../src/lib/prisma");
  const { PURPOSE_DEFAULTS } = await import("../src/lib/email-template");
  const { subject, body } = PURPOSE_DEFAULTS[PURPOSE_KEY];

  const org = await prisma.emailTemplate.findUnique({ where: { purposeKey: PURPOSE_KEY } });
  let orgChanged = 0;
  if (org && org.body.includes(PLACEHOLDER_MARKER)) {
    orgChanged = 1;
    console.log(`  ${apply ? "update" : "would update"}: org default`);
    if (apply) await prisma.emailTemplate.update({ where: { purposeKey: PURPOSE_KEY }, data: { subject, body } });
  }

  const eventOverrides = await prisma.eventEmailTemplate.findMany({
    where: { purposeKey: PURPOSE_KEY, body: { contains: PLACEHOLDER_MARKER } },
    select: { id: true, event: { select: { name: true } } },
  });
  for (const o of eventOverrides) {
    console.log(`  ${apply ? "update" : "would update"}: ${o.event.name}`);
    if (apply) await prisma.eventEmailTemplate.update({ where: { id: o.id }, data: { subject, body } });
  }

  console.log(`${apply ? "Updated" : "Would update"}: ${orgChanged + eventOverrides.length} row(s).${apply ? "" : " Re-run with --apply."}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
