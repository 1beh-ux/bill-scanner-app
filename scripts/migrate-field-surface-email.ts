// E-mails and documents got separate switches (ParticipantFieldSurface.email split
// from documents): every field that was usable in both keeps being so. Run once
// AFTER the code knowing `email` is live. Idempotent.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const events = await prisma.$executeRaw`
    UPDATE event_participant_fields
    SET surfaces = array_append(surfaces, 'email'::"ParticipantFieldSurface")
    WHERE 'documents' = ANY(surfaces) AND NOT ('email' = ANY(surfaces))`;
  const templates = await prisma.$executeRaw`
    UPDATE participant_field_templates
    SET default_surfaces = array_append(default_surfaces, 'email'::"ParticipantFieldSurface")
    WHERE 'documents' = ANY(default_surfaces) AND NOT ('email' = ANY(default_surfaces))`;
  console.log(`  ok: email surface added to ${events} event fields, ${templates} org templates`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
