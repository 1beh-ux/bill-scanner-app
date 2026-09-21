// Scripted checks for the bills-module UX work (docs/drive-payers-roles-change-notes.md,
// Parts 9-14): calls the real route handlers with a swappable "current user" against
// the LOCAL database; the ČNB network call is faked. Refuses to run against a non-local DB.
//
//   npx tsx scripts/verify-bills-ux.ts
import { config } from "dotenv";
config({ path: ".env" });
import { NextRequest } from "next/server";

if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "")) {
  console.error("Refusing to run: DATABASE_URL is not local.");
  process.exit(1);
}

type FakeUser = import("../src/generated/prisma").User;
let currentUser: FakeUser | null = null;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module");
const origLoad = Module._load;
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === "@/lib/auth") return { getCurrentUser: async () => currentUser };
  return origLoad.apply(this, [request, parent, isMain]);
};

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${!ok && detail ? `  -> ${detail}` : ""}`);
}

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
async function call(handler: Handler, opts: { url: string; method?: string; body?: unknown; params?: Record<string, string>; user: FakeUser | null }) {
  currentUser = opts.user;
  const req = new NextRequest(`http://localhost${opts.url}`, {
    method: opts.method ?? "GET",
    ...(opts.body !== undefined && { body: JSON.stringify(opts.body), headers: { "Content-Type": "application/json" } }),
  });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { convertToCzk } = await import("../src/lib/exchange-rates");
  const run = Date.now().toString(36);
  const user = await prisma.user.upsert({ where: { email: "b-user@test.local" }, update: { active: true }, create: { email: "b-user@test.local", displayName: "b-user", role: "user" } });

  console.log("== Part 9: foreign-currency preview uses the same conversion as saving");
  const lookup = (await import("../src/app/api/exchange-rates/lookup/route")).GET as unknown as Handler;
  // A Friday's fixing is stored; the bill is dated Saturday.
  const friday = new Date("2019-03-01T00:00:00.000Z");
  await prisma.exchangeRate.upsert({
    where: { currency_rateDate: { currency: "EUR", rateDate: friday } },
    update: { rateToCzk: "25.6" },
    create: { currency: "EUR", rateDate: friday, rateToCzk: "25.6" },
  });
  let r = await call(lookup, { url: "/x?currency=EUR&date=2019-03-02", user });
  check("weekend date falls back to the previous published day (Friday's rate)", r.status === 200 && r.json.rateDate === "2019-03-01" && parseFloat(r.json.rateToCzk) === 25.6, JSON.stringify(r.json));
  const saved = await convertToCzk("100", "EUR", new Date("2019-03-02T00:00:00.000Z"));
  check("preview amount == what saving computes (same function, same rate)", saved?.amountCzk.toString() === (Math.round(100 * parseFloat(r.json.rateToCzk) * 100) / 100).toFixed(2).replace(/\.?0+$/, "") || Number(saved?.amountCzk) === Math.round(100 * parseFloat(r.json.rateToCzk) * 100) / 100, `${saved?.amountCzk}`);
  r = await call(lookup, { url: "/x?currency=EUR&date=2019-03-02", user: null });
  check("lookup needs a login (401)", r.status === 401);
  r = await call(lookup, { url: "/x?currency=USD&date=2019-03-02", user });
  check("unknown currency -> 400 invalid_currency", r.status === 400 && r.json.error === "invalid_currency");
  r = await call(lookup, { url: "/x?currency=EUR&date=not-a-date", user });
  check("bad date -> 400 invalid_date", r.status === 400 && r.json.error === "invalid_date");

  // start from a known state so the script can be re-run (a previous run caches the fetched day)
  await prisma.exchangeRate.deleteMany({ where: { rateDate: { lte: new Date("2005-01-01T00:00:00.000Z") } } });
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("", { status: 500 })) as typeof fetch;
  r = await call(lookup, { url: "/x?currency=EUR&date=2001-01-01", user });
  check("no stored rate and ČNB unreachable -> 404 rate_unavailable (a real 'cannot fetch', not a missing date)", r.status === 404 && r.json.error === "rate_unavailable", JSON.stringify(r.json));

  let fetched = 0;
  globalThis.fetch = (async (url: string) => {
    fetched++;
    return new Response(`02.01.2001 #1\nzemě|měna|množství|kód|kurz\nEMU|euro|1|EUR|35,000\nPolsko|zlotý|1|PLN|8,000`, { status: 200 });
  }) as unknown as typeof fetch;
  r = await call(lookup, { url: "/x?currency=EUR&date=2001-01-02", user });
  check("an old date with no stored rate is fetched on demand (no 60-day limit)", r.status === 200 && parseFloat(r.json.rateToCzk) === 35 && r.json.rateDate === "2001-01-02" && fetched === 1, JSON.stringify(r.json));
  const stored = await prisma.exchangeRate.findFirst({ where: { currency: "EUR", rateDate: new Date("2001-01-02T00:00:00.000Z") } });
  check("...and the fetched rate is cached in the ExchangeRate table", !!stored && Number(stored.rateToCzk) === 35);
  r = await call(lookup, { url: "/x?currency=EUR&date=2001-01-02", user });
  check("second lookup for that day hits the cache (no new ČNB call)", r.status === 200 && fetched === 1, `fetched=${fetched}`);
  globalThis.fetch = realFetch;

  console.log("\n== Part 10: budget page is neutral at zero budgets");
  const { budgetState } = await import("../src/lib/budget");
  let b = budgetState(0, 0);
  check("budget 0, spent 0 -> no budget, not over, no bar, no remainder", !b.hasBudget && !b.over && b.percent === null && b.remaining === null);
  b = budgetState(0, 12500);
  check("budget 0 but money spent -> still NOT red (was: every category red)", !b.hasBudget && !b.over);
  b = budgetState(1000, 500);
  check("budget 1000, spent 500 -> 50 % bar, 500 left, not over", b.hasBudget && !b.over && b.percent === 50 && b.remaining === 500);
  b = budgetState(1000, 1500);
  check("budget 1000, spent 1500 -> red, bar capped at 100, -500 left", b.over && b.percent === 100 && b.remaining === -500);
  b = budgetState(1000, 1000);
  check("spent exactly the budget -> not red", !b.over && b.percent === 100);
  b = budgetState(NaN, NaN);
  check("garbage input is treated as no budget (no crash)", !b.hasBudget && !b.over);
  const rows = [{ b: 0, a: 300 }, { b: 0, a: 0 }];
  const tot = budgetState(rows.reduce((n, r) => n + r.b, 0), rows.reduce((n, r) => n + r.a, 0));
  check("totals row with all budgets 0 -> neutral too", !tot.hasBudget && !tot.over);

  void run;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
