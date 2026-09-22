// One-off, safe to re-run: replaces two default e-mail template bodies that this
// session's Part 11-I/8 work rewrote, wherever a row still has the OLD text --
// registration_acceptance's "[PLACEHOLDER: text a přílohy doladíme později]", and
// mail_helper_bulk_status_update's hard-coded "Odkaz na vyplnění dotazníku:
// {{questionnaire_url}}." (replaced by the self-omitting {{questionnaire_line}}).
// Only touches rows that still contain the OLD marker text -- anyone who already
// wrote their own wording keeps it. Covers both the org-wide default
// (EmailTemplate) and any per-event override (EventEmailTemplate).
//
//   npx tsx scripts/fix-stale-default-email-templates.ts            # dry run
//   npx tsx scripts/fix-stale-default-email-templates.ts --apply
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

const TARGETS: { purposeKey: string; marker: string }[] = [
  { purposeKey: "registration_acceptance", marker: "[PLACEHOLDER" },
  { purposeKey: "mail_helper_bulk_status_update", marker: "Odkaz na vyplnění dotazníku: {{questionnaire_url}}" },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../src/lib/prisma");
  const { PURPOSE_DEFAULTS } = await import("../src/lib/email-template");

  let total = 0;
  for (const { purposeKey, marker } of TARGETS) {
    const { subject, body } = PURPOSE_DEFAULTS[purposeKey];

    const org = await prisma.emailTemplate.findUnique({ where: { purposeKey } });
    if (org && org.body.includes(marker)) {
      total++;
      console.log(`  ${apply ? "update" : "would update"}: org default (${purposeKey})`);
      if (apply) await prisma.emailTemplate.update({ where: { purposeKey }, data: { subject, body } });
    }

    const eventOverrides = await prisma.eventEmailTemplate.findMany({
      where: { purposeKey, body: { contains: marker } },
      select: { id: true, event: { select: { name: true } } },
    });
    for (const o of eventOverrides) {
      total++;
      console.log(`  ${apply ? "update" : "would update"}: ${o.event.name} (${purposeKey})`);
      if (apply) await prisma.eventEmailTemplate.update({ where: { id: o.id }, data: { subject, body } });
    }
  }

  console.log(`${apply ? "Updated" : "Would update"}: ${total} row(s).${apply ? "" : " Re-run with --apply."}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
