// One-off: seeds FIXED_PARTICIPANT_FIELDS (Name/datum_narozeni/guardian
// fields/price/var_symb/picture) onto every existing event, so documents
// that already merge those {{keys}} keep resolving after the MergeVariable
// table is dropped -- new events get these automatically from
// src/app/api/events/route.ts, this just backfills events created before
// that. Safe to re-run (seedFixedParticipantFields skips existing keys).
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { seedFixedParticipantFields } = await import("../src/lib/participant-field-seed");

  const events = await prisma.event.findMany({ select: { id: true, name: true } });
  for (const event of events) {
    const added = await seedFixedParticipantFields(event.id);
    console.log(`  ${event.name}: +${added}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
