// STAGING ONLY: drop the public web addresses (akce.zare.cz ...) a production copy brought along -- staging must
// serve its public pages itself, never send visitors to the production site.
async function main() {
  if (process.env.APP_ENV !== "staging" || !/@127\.0\.0\.1:55440\//.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: not the staging DB");
  const { prisma } = await import("../../src/lib/prisma");
  if (!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }))) throw new Error("refusing: no staging marker");
  console.log("public hosts removed:", (await prisma.publicHost.deleteMany({})).count);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
export {};
