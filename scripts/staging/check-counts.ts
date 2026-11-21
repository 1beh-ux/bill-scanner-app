// Read-only: translation count, plus (only on staging) a check that every address is invented or the owner's.
async function main() {
  const { prisma } = await import("../../src/lib/prisma");
  const translations = await prisma.translation.count();
  if (process.env.APP_ENV !== "staging") { console.log({ translations }); return; }
  const owner = "1beh@zare.cz";
  const bad = (e: string) => e !== "" && e !== owner && !e.endsWith(".invalid");
  const users = (await prisma.user.findMany({ select: { email: true } })).filter((u) => bad(u.email)).length;
  const cg = (await prisma.childGuardian.findMany({ select: { email: true } })).filter((g) => bad(g.email)).length;
  const pg = (await prisma.participantGuardian.findMany({ select: { email: true } })).filter((g) => bad(g.email)).length;
  const orgs = (await prisma.organization.findMany({ select: { contactEmail: true } })).filter((o) => o.contactEmail && bad(o.contactEmail)).length;
  console.log({ translations, nonInventedAddresses: { users, childGuardians: cg, participantGuardians: pg, organizations: orgs } });
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
