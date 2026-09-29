// {{registration_deadline}} is now just the date; the old whole-sentence meaning
// moved to {{registration_deadline_line}}. Templates that used the variable as a
// line of its own keep their meaning: that line is rewritten. Idempotent.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

const LINE = /^([ \t]*)\{\{registration_deadline\}\}([ \t]*)$/gm;

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  let changed = 0;
  for (const t of await prisma.emailTemplate.findMany()) {
    const body = t.body.replace(LINE, "$1{{registration_deadline_line}}$2");
    if (body !== t.body) {
      await prisma.emailTemplate.update({ where: { id: t.id }, data: { body } });
      changed++;
    }
  }
  for (const t of await prisma.eventEmailTemplate.findMany()) {
    const body = t.body.replace(LINE, "$1{{registration_deadline_line}}$2");
    if (body !== t.body) {
      await prisma.eventEmailTemplate.update({ where: { id: t.id }, data: { body } });
      changed++;
    }
  }
  console.log(`  ok: ${changed} templates moved to {{registration_deadline_line}}`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
