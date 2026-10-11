// One-off (docs/embed-design.md Part 8): let www.zare.cz / zare.cz frame Záře's public hosts and,
// once the portal page exists on zare.cz, make portal links point there.
//   npx tsx scripts/set-zare-embed.ts                 -- dry run: what would change
//   npx tsx scripts/set-zare-embed.ts --apply         -- embedOrigins on both hosts
//   npx tsx scripts/set-zare-embed.ts --apply --page  -- also rodice's embedPageUrl, only if that
//                                                        page answers 200 with the portal snippet
//   ... --page --force                                -- set it even without the page (links break until it exists!)
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

const HOSTS = ["prihlasky.kasicka.eu", "rodice.kasicka.eu"];
const ORIGINS = ["https://www.zare.cz", "https://zare.cz"];
const PAGE = "https://www.zare.cz/rodicovsky-portal";
const PAGE_HOST = "rodice.kasicka.eu";

async function main() {
  const apply = process.argv.includes("--apply");
  const withPage = process.argv.includes("--page");
  const force = process.argv.includes("--force");
  const { prisma } = await import("../src/lib/prisma");
  const rows = await prisma.publicHost.findMany({ where: { hostname: { in: HOSTS } }, select: { id: true, hostname: true, purpose: true, embedOrigins: true, embedPageUrl: true } });
  for (const h of HOSTS) if (!rows.some((r) => r.hostname === h)) throw new Error(`host ${h} not found`);

  let pageOk = false;
  if (withPage) {
    const res = await fetch(PAGE, { redirect: "follow", signal: AbortSignal.timeout(15_000) }).catch(() => null);
    pageOk = !!res?.ok && (await res.text()).includes("tabornik-portal");
    console.log(`${PAGE}: ${res ? `HTTP ${res.status}` : "unreachable"}, portal snippet ${pageOk ? "found" : "NOT found"}`);
  }
  const setPage = withPage && (pageOk || force);
  for (const r of rows) {
    const origins = [...new Set([...r.embedOrigins, ...ORIGINS])];
    const page = setPage && r.hostname === PAGE_HOST ? PAGE : r.embedPageUrl;
    console.log(`${r.hostname} (${r.purpose}): embedOrigins ${JSON.stringify(r.embedOrigins)} -> ${JSON.stringify(origins)}; embedPageUrl ${r.embedPageUrl ?? "null"} -> ${page ?? "null"}`);
    if (apply) await prisma.publicHost.update({ where: { id: r.id }, data: { embedOrigins: origins, embedPageUrl: page } });
  }
  if (withPage && !setPage) console.log("embedPageUrl NOT set: the page isn't there yet (portal links keep pointing at the portal host). Rerun with --page once it is.");
  console.log(apply ? "\napplied (each Cloud Run instance picks it up within 60 s)" : "\ndry run -- rerun with --apply");
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
