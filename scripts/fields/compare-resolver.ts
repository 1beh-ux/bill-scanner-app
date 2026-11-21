// Fields Manager phase 1 golden check (STAGING ONLY): for every participant of every event, the document and e-mail
// variables with the organization flag OFF and ON must agree on every key that exists with the flag off.
// Turns the flag on for the duration and back off at the end (also on failure). Prints counts only.
//   bash scripts/staging/run-staging-db.sh npx tsx scripts/fields/compare-resolver.ts
async function main() {
  if (process.env.APP_ENV !== "staging" || !/@127\.0\.0\.1:55440\//.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: not the staging DB");
  const { prisma } = await import("../../src/lib/prisma");
  if (!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }))) throw new Error("refusing: no staging marker");
  const { resolveVariables } = await import("../../src/lib/document-variables");
  const { invalidateResolverContext } = await import("../../src/lib/field-resolver");

  const orgs = await prisma.organization.findMany({ select: { id: true, features: true } });
  const setFlag = async (on: boolean) => {
    for (const o of orgs) await prisma.organization.update({ where: { id: o.id }, data: { features: on ? ["fields_manager"] : o.features.filter((f) => f !== "fields_manager") } });
    invalidateResolverContext();
  };

  const events = await prisma.event.findMany({ orderBy: { startDate: "asc" } });
  type Run = Record<string, Record<string, string>>;
  const collect = async (): Promise<Run> => {
    const out: Run = {};
    for (const event of events) {
      // Same participant load as the document preview / real send (guardians receiving communications).
      const participants = await prisma.participant.findMany({ where: { eventId: event.id }, include: { guardians: { where: { receivesCommunications: true } } } });
      for (const p of participants) {
        for (const surface of ["documents", "email"] as const) {
          const { text } = await resolveVariables({ ...p, customFieldValues: p.customFieldValues as Record<string, string> | null }, event, surface, false);
          out[`${p.id}:${surface}`] = text;
        }
      }
    }
    return out;
  };

  const off = await collect();
  let on: Run;
  try {
    await setFlag(true);
    on = await collect();
  } finally {
    await setFlag(false);
  }

  let compared = 0, differences = 0, added = 0;
  const addedKeys = new Set<string>();
  for (const [id, a] of Object.entries(off)) {
    const b = on[id];
    for (const [k, v] of Object.entries(a)) {
      compared++;
      if (b[k] !== v) {
        differences++;
        if (differences <= 5) console.log(`  DIFF key ${k} (${id.split(":")[1]})`); // key name only, no values
      }
    }
    for (const k of Object.keys(b)) if (!(k in a)) { added++; addedKeys.add(k.replace(/^guardian\d_/, "guardianN_")); }
  }
  console.log(JSON.stringify({ variableSets: Object.keys(off).length, keysCompared: compared, differences, keysAddedWithFlagOn: added, addedKinds: [...addedKeys].sort() }));
  const flagStillOn = (await prisma.organization.findMany({ select: { features: true } })).filter((o) => o.features.includes("fields_manager")).length;
  console.log(`flag on afterwards: ${flagStillOn} organizations`);
  if (differences > 0) process.exit(1);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });

export {}; // a module, not a global script (two scripts with main() must not collide in the type check)
