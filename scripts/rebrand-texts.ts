// "Bill Scanner V2" / "Bill Scanner" -> "tabornik.online" in database texts:
// translations (cs + en), e-mail templates and per-event e-mail templates.
// npx tsx scripts/rebrand-texts.ts           -- dry run, prints every hit
// npx tsx scripts/rebrand-texts.ts --apply   -- writes
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

// "V2" first so it doesn't leave a stray " V2" behind; case-insensitive, also "BillScanner".
const PATTERN = /bill\s?scanner(\s+v2)?/gi;
const rebrand = (s: string) => s.replace(PATTERN, "tabornik.online");
const hit = (s: string) => new RegExp(PATTERN.source, "i").test(s);

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../src/lib/prisma");
  let count = 0;
  const show = (where: string, field: string, before: string) => {
    count++;
    console.log(`${where} [${field}]\n  - ${before}\n  + ${rebrand(before)}`);
  };

  for (const t of await prisma.translation.findMany()) {
    if (!hit(t.cs) && !hit(t.en)) continue;
    if (hit(t.cs)) show(`translation ${t.key}`, "cs", t.cs);
    if (hit(t.en)) show(`translation ${t.key}`, "en", t.en);
    if (apply) await prisma.translation.update({ where: { key: t.key }, data: { cs: rebrand(t.cs), en: rebrand(t.en) } });
  }
  for (const t of await prisma.emailTemplate.findMany()) {
    if (!hit(t.subject) && !hit(t.body)) continue;
    if (hit(t.subject)) show(`emailTemplate ${t.purposeKey}`, "subject", t.subject);
    if (hit(t.body)) show(`emailTemplate ${t.purposeKey}`, "body", t.body);
    if (apply) await prisma.emailTemplate.update({ where: { id: t.id }, data: { subject: rebrand(t.subject), body: rebrand(t.body) } });
  }
  for (const t of await prisma.eventEmailTemplate.findMany()) {
    if (!hit(t.subject) && !hit(t.body)) continue;
    if (hit(t.subject)) show(`eventEmailTemplate ${t.eventId}/${t.purposeKey}`, "subject", t.subject);
    if (hit(t.body)) show(`eventEmailTemplate ${t.eventId}/${t.purposeKey}`, "body", t.body);
    if (apply) await prisma.eventEmailTemplate.update({ where: { id: t.id }, data: { subject: rebrand(t.subject), body: rebrand(t.body) } });
  }
  console.log(`${count} hit(s)${apply ? ", applied" : " -- dry run, rerun with --apply"}`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
