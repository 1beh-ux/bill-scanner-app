// Adds the computed "Členství (rok akce)" field (and any other missing fixed field) to every event that has participants' fields. Idempotent.
import { config } from "dotenv";
config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { seedFixedParticipantFields } = await import("../src/lib/participant-field-seed");
  const events = await prisma.event.findMany({ where: { kind: { not: "public_event" } }, select: { id: true } });
  let added = 0;
  for (const e of events) added += await seedFixedParticipantFields(e.id);
  console.log(`ok: ${added} fixed fields added over ${events.length} events`);
  await prisma.$disconnect();
}
main();
