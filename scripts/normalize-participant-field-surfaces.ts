// One-off, safe to re-run: Part 4 of the participants/settings prompt replaces the
// admin UI's per-surface checkboxes with one derived category (Zdraví/Dokumenty a
// pošta/Vlastní) plus a single "show in list" toggle. This normalizes every existing
// CUSTOM field's `surfaces` to the category's "sensible defaults" -- derives the
// category from the field's current surfaces, keeps its current `list` on/off choice,
// and rewrites the full surfaces array from that (documents+import always on for a
// custom field; health_list+health_detail for a Zdraví field; mail_list for Dokumenty
// a pošta). Builtin/guardian/computed rows are untouched -- those are fixed rows
// managed by FIXED_PARTICIPANT_FIELDS, not admin-editable custom fields.
//
//   npx tsx scripts/normalize-participant-field-surfaces.ts            # dry run
//   npx tsx scripts/normalize-participant-field-surfaces.ts --apply
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../src/lib/prisma");
  const { fieldCategory, surfacesForCategory } = await import("../src/lib/participant-fields");

  const eventFields = await prisma.eventParticipantField.findMany({
    where: { kind: "custom" },
    select: { id: true, key: true, surfaces: true, event: { select: { name: true } } },
  });
  let eventChanged = 0;
  for (const f of eventFields) {
    const category = fieldCategory("custom", f.surfaces);
    const normalized = surfacesForCategory(category, f.surfaces.includes("list"));
    const same = normalized.length === f.surfaces.length && normalized.every((s) => f.surfaces.includes(s));
    if (same) continue;
    eventChanged++;
    console.log(`  ${apply ? "update" : "would update"}: "${f.key}" on ${f.event.name} -- ${f.surfaces.join(",")} -> ${normalized.join(",")}`);
    if (apply) await prisma.eventParticipantField.update({ where: { id: f.id }, data: { surfaces: normalized } });
  }

  const templates = await prisma.participantFieldTemplate.findMany({ select: { key: true, defaultSurfaces: true } });
  let templateChanged = 0;
  for (const t of templates) {
    const category = fieldCategory("custom", t.defaultSurfaces);
    const normalized = surfacesForCategory(category, t.defaultSurfaces.includes("list"));
    const same = normalized.length === t.defaultSurfaces.length && normalized.every((s) => t.defaultSurfaces.includes(s));
    if (same) continue;
    templateChanged++;
    console.log(`  ${apply ? "update" : "would update"}: template "${t.key}" -- ${t.defaultSurfaces.join(",")} -> ${normalized.join(",")}`);
    if (apply) await prisma.participantFieldTemplate.update({ where: { key: t.key }, data: { defaultSurfaces: normalized } });
  }

  console.log(`${apply ? "Updated" : "Would update"}: ${eventChanged} event field(s), ${templateChanged} template(s) (of ${eventFields.length} / ${templates.length}).${apply ? "" : " Re-run with --apply."}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
