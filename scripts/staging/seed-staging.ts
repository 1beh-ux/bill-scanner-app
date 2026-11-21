// STAGING ONLY (docs/staging/plan.md): fills a fresh staging database with INVENTED data.
//   bash scripts/staging/run-staging-db.sh npx tsx scripts/staging/seed-staging.ts
// Refuses unless APP_ENV=staging, the connection is the staging proxy (127.0.0.1:55440), and the DB is
// either empty (no people yet -> it gets the staging marker) or already carries the staging marker.
// Seeds once: a second run only reports. To start over, drop and recreate the staging database.
import { execFileSync } from "node:child_process";

const ORG_NAME = "Testovací oddíl (STAGING)";
const OWNER_EMAIL = "1beh@zare.cz"; // the only account that can sign in on staging
const MARKER = "staging_marker";

function guardEnv() {
  if (process.env.APP_ENV !== "staging") throw new Error("refusing: APP_ENV is not 'staging'");
  const url = process.env.DATABASE_URL ?? "";
  if (!/@127\.0\.0\.1:55440\/billscanner\b/.test(url)) throw new Error("refusing: DATABASE_URL is not the staging proxy (127.0.0.1:55440)");
}

// ---- invented people -------------------------------------------------------------------------------
const FIRST_M = ["Adam", "Matyáš", "Ondřej", "Vojtěch", "Šimon", "Kryštof", "Tobiáš", "Eliáš", "Hynek", "Bořek", "Radim", "Kvido"];
const FIRST_F = ["Ema", "Rozálie", "Bára", "Johana", "Viktorie", "Magdaléna", "Anežka", "Kristýna", "Dorota", "Žofie", "Albína", "Liliana"];
const LAST = ["Testovský", "Smyšlený", "Vzorový", "Pokusný", "Ukázkový", "Zkušební", "Modelový", "Fiktivní", "Náhodný", "Příkladný", "Cvičný", "Makový", "Borůvkový", "Šiškový", "Kapradinový"];
const fem = (last: string) => (last.endsWith("ý") ? last.slice(0, -1) + "á" : last + "ová");
const ascii = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Deterministic pseudo-random, so a reseed produces the same people.
let seed = 20261121;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

type Guardian = { name: string; email: string; relationship: string; phone: string };
type Kid = { first: string; last: string; dob: string; guardians: Guardian[]; values: Record<string, string>; note: string };

function inventKids(): Kid[] {
  const kids: Kid[] = [];
  for (let i = 0; i < 24; i++) {
    const girl = i % 2 === 1;
    const famLast = LAST[i % LAST.length];
    const last = girl ? fem(famLast) : famLast;
    const first = girl ? FIRST_F[i % FIRST_F.length] : FIRST_M[i % FIRST_M.length];
    const y = 2012 + Math.floor(rnd() * 8), m = 1 + Math.floor(rnd() * 12), d = 1 + Math.floor(rnd() * 28);
    const mother: Guardian = { name: `${pick(FIRST_F)} ${fem(famLast)}`, email: `matka.${ascii(famLast)}${i}@example.invalid`, relationship: "matka", phone: `+420 999 ${String(100000 + i * 7919).slice(-6, -3)} ${String(i * 37).padStart(3, "0")}` };
    const father: Guardian = { name: `${pick(FIRST_M)} ${famLast}`, email: `otec.${ascii(famLast)}${i}@example.invalid`, relationship: "otec", phone: `+420 999 ${String(200000 + i * 6007).slice(-6, -3)} ${String(i * 41).padStart(3, "0")}` };
    const guardians = i % 3 === 0 ? [mother, father] : [i % 2 ? mother : father]; // every third child: two guardians
    kids.push({
      first, last, dob: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, guardians,
      values: {
        tricko: pick(["122", "134", "146", "158", "S", "M"]),
        plavec: rnd() > 0.3 ? "true" : "false",
        vyska_cm: String(120 + Math.floor(rnd() * 50)),
        datum_prihlasky: `2026-0${1 + Math.floor(rnd() * 5)}-1${Math.floor(rnd() * 9)}`,
        ulice: `Smyšlená ${1 + i}`, mesto: pick(["Testov", "Vzorovice", "Pokusná Lhota"]), psc: `999 ${String(10 + i).padStart(2, "0")}`,
        poznamka: i % 5 === 0 ? "Vymyšlená poznámka pro test." : "",
      },
      note: "",
    });
  }
  // One child whose guardian has no e-mail.
  kids[4].guardians = [{ ...kids[4].guardians[0], email: "" }];
  kids[4].note = "guardian without e-mail";
  // Three exact duplicates (same name + birth date, separate records, as after a double import).
  for (const i of [1, 6, 11]) kids.push({ ...kids[i], guardians: kids[i].guardians.map((g) => ({ ...g })), note: "exact duplicate" });
  // Three near-duplicates: surname typo, first/last swapped, missing diacritics.
  kids.push({ ...kids[2], last: kids[2].last.replace(/ý$/, "i"), note: "near duplicate: surname typo" });
  kids.push({ ...kids[8], first: kids[8].last, last: kids[8].first, note: "near duplicate: first/last swapped" });
  kids.push({ ...kids[13], first: ascii(kids[13].first).replace(/^./, (c) => c.toUpperCase()), last: ascii(kids[13].last).replace(/^./, (c) => c.toUpperCase()), note: "near duplicate: no diacritics" });
  return kids;
}

async function main() {
  guardEnv();
  const { prisma } = await import("../../src/lib/prisma");
  const { createEventWithDefaults } = await import("../../src/lib/event-create");
  const { ensureDefaultTravelRates } = await import("../../src/lib/travel-rates-defaults");

  const marker = await prisma.appSetting.findUnique({ where: { key: MARKER } });
  if (!marker) {
    const people = await prisma.child.count();
    const orgs = await prisma.organization.count();
    if (people > 0 || orgs > 0) throw new Error(`refusing: database has ${orgs} organizations / ${people} people and no staging marker`);
    await prisma.appSetting.create({ data: { key: MARKER, value: { createdAt: new Date().toISOString(), note: "invented data only" } } });
  }
  const existing = await prisma.organization.findFirst({ where: { name: ORG_NAME } });
  if (existing && (await prisma.event.count({ where: { organizationId: existing.id } })) > 0) {
    console.log("already seeded -- counts:", await counts(prisma));
    return;
  }

  // 1. Base data from prisma/seed.ts (translations, category + list templates) into the staging organization.
  execFileSync("npx", ["tsx", "prisma/seed.ts"], { stdio: "inherit", env: { ...process.env, SEED_ORGANIZATION: ORG_NAME } });
  const org = await prisma.organization.findFirstOrThrow({ where: { name: ORG_NAME } });
  await prisma.organization.update({ where: { id: org.id }, data: { shortName: "STAGING", contactEmail: "oddil@example.invalid", city: "Testov" } });
  // prisma/seed.ts creates real organization users: on staging only the owner stays, plus invented ones.
  const removed = await prisma.user.deleteMany({ where: { email: { not: OWNER_EMAIL } } });
  await prisma.user.update({ where: { email: OWNER_EMAIL }, data: { isSuperAdmin: true, role: "admin", displayName: "Staging admin" } });
  await prisma.user.createMany({
    data: [
      { email: "ucetni@example.invalid", displayName: "Účetní (smyšlená)", role: "accountant", organizationId: org.id },
      { email: "vedouci@example.invalid", displayName: "Vedoucí (smyšlený)", role: "user", organizationId: org.id },
    ],
  });
  await ensureDefaultTravelRates(prisma, org.id);

  // 2. Organization field templates: one of every type (composite built from three text parts).
  const T = (key: string, label: string, fieldType: "text" | "number" | "date" | "boolean" | "select" | "image" | "composite", extra: object = {}) =>
    ({ key, label, fieldType, organizationId: org.id, defaultSurfaces: ["list" as const], ...extra });
  await prisma.participantFieldTemplate.createMany({
    data: [
      T("tricko", "Velikost trička", "select", { options: ["122", "134", "146", "158", "S", "M", "L"], portalAccess: "edit", requiredInRegistration: true }),
      T("plavec", "Plavec", "boolean", { portalAccess: "edit" }),
      T("vyska_cm", "Výška (cm)", "number"),
      T("datum_prihlasky", "Datum přihlášky", "date"),
      T("foto", "Fotografie", "image", { portalAccess: "approval" }),
      T("poznamka", "Poznámka", "text", { defaultSurfaces: ["list", "documents", "email"] }),
      T("ulice", "Ulice", "text", { level: "detailed" }),
      T("mesto", "Město", "text", { level: "detailed" }),
      T("psc", "PSČ", "text", { level: "detailed" }),
      T("adresa", "Adresa", "composite", { options: { parts: ["ulice", "psc", "mesto"], separator: ", " }, defaultSurfaces: ["list", "documents"] }),
    ],
  });

  // 3. Events: past camp, current weekend, upcoming camp with public registration, a public ticketed event.
  const past = await createEventWithDefaults({ name: "Letní tábor 2025 (STAGING)", startDate: "2025-07-05", endDate: "2025-07-19", organizationId: org.id, isPublic: false });
  await prisma.event.update({ where: { id: past.id }, data: { status: "closed", closedAt: new Date("2025-08-01") } });
  const weekend = await createEventWithDefaults({ name: "Víkendovka listopad (STAGING)", startDate: "2026-11-20", endDate: "2026-11-22", organizationId: org.id, isPublic: false });
  const camp = await createEventWithDefaults({ name: "Letní tábor 2027 (STAGING)", startDate: "2027-07-03", endDate: "2027-07-17", organizationId: org.id, isPublic: false });
  await prisma.event.update({
    where: { id: camp.id },
    data: { publicRegistration: true, registrationConnected: true, publicSlug: "staging-tabor-2027", registrationDeadline: new Date("2027-05-31"), memberPriceCzk: 4500, nonMemberPriceCzk: 5200, publicContactEmail: "tabor@example.invalid", location: "Tábořiště Testov" },
  });
  for (const moduleKey of ["participants", "registration", "portal", "health", "mail"] as const)
    await prisma.eventModule.upsert({ where: { eventId_moduleKey: { eventId: camp.id, moduleKey } }, update: { enabled: true }, create: { eventId: camp.id, moduleKey, enabled: true } });
  await createEventWithDefaults({ name: "Oddílový ples (STAGING)", startDate: "2027-02-13", endDate: "2027-02-13", organizationId: org.id, isPublic: true });

  // 4. People + their event participations.
  const kids = inventKids();
  let n = 0;
  for (const [i, k] of kids.entries()) {
    const child = await prisma.child.create({
      data: {
        organizationId: org.id, name: `${k.first} ${k.last}`, firstName: k.first, lastName: k.last, dateOfBirth: new Date(k.dob), fieldValues: k.values,
        guardians: { create: k.guardians.map((g) => ({ ...g })) },
      },
    });
    const inEvents = [i < 20 ? past : null, i % 2 === 0 ? weekend : null, i >= 10 ? camp : null].filter((e): e is NonNullable<typeof e> => !!e);
    for (const ev of inEvents) {
      await prisma.participant.create({
        data: {
          eventId: ev.id, childId: child.id, name: child.name, firstName: k.first, lastName: k.last, dateOfBirth: new Date(k.dob),
          registrationStatus: ev.id === camp.id && i % 3 === 0 ? "pending" : "accepted", customFieldValues: k.values,
          registrationNumber: ++n, guardians: { create: k.guardians.map((g) => ({ ...g })) },
        },
      });
    }
  }

  console.log(`seeded (removed ${removed.count} non-staging users from prisma/seed.ts) -- counts:`, await counts(prisma));
}

async function counts(prisma: typeof import("../../src/lib/prisma").prisma) {
  // Sequential on purpose: nine parallel connections drop on the db-f1-micro staging instance.
  return {
    organizations: await prisma.organization.count(),
    users: await prisma.user.count(),
    events: await prisma.event.count(),
    people: await prisma.child.count(),
    guardians: await prisma.childGuardian.count(),
    participants: await prisma.participant.count(),
    fieldTemplates: await prisma.participantFieldTemplate.count(),
    eventFields: await prisma.eventParticipantField.count(),
    translations: await prisma.translation.count(),
  };
}

main().then(() => process.exit(0)).catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
