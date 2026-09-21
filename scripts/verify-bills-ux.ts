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

  console.log("\n== Part 11: bills list columns are stored per event, for everyone with access");
  const cols = await import("../src/lib/bill-columns");
  check("normalize: unknown keys and duplicates dropped, required columns kept", JSON.stringify(cols.normalizeBillColumns(["amount", "bogus", "amount", "note"])) === JSON.stringify(["amount", "note", "status", "merchant"]));
  check("normalize: empty/invalid input -> the default set", JSON.stringify(cols.normalizeBillColumns(null)) === JSON.stringify(cols.DEFAULT_BILL_COLUMNS) && JSON.stringify(cols.normalizeBillColumns([])) === JSON.stringify(cols.DEFAULT_BILL_COLUMNS) && JSON.stringify(cols.normalizeBillColumns("x")) === JSON.stringify(cols.DEFAULT_BILL_COLUMNS));
  check("the default set contains paid status and the required columns", cols.DEFAULT_BILL_COLUMNS.includes("paid") && cols.REQUIRED_BILL_COLUMNS.every((k) => cols.DEFAULT_BILL_COLUMNS.includes(k)));
  const eventRoute = await import("../src/app/api/events/[id]/route");
  const u2 = await prisma.user.upsert({ where: { email: "b-user2@test.local" }, update: { active: true }, create: { email: "b-user2@test.local", displayName: "b-user2", role: "user" } });
  const outsider = await prisma.user.upsert({ where: { email: "b-outsider@test.local" }, update: { active: true }, create: { email: "b-outsider@test.local", displayName: "b-outsider", role: "user" } });
  const ev = await prisma.event.create({ data: { name: `Cols ${run}`, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-10") } });
  await prisma.userEventModuleAccess.createMany({ data: [user, u2].map((u) => ({ userId: u.id, eventId: ev.id, moduleKey: "bills" as const })), skipDuplicates: true });
  const patch = (u: FakeUser, body: unknown) => call(eventRoute.PATCH as unknown as Handler, { url: "/x", method: "PATCH", params: { id: ev.id }, user: u, body });
  const getEv = (u: FakeUser) => call(eventRoute.GET as unknown as Handler, { url: "/x", params: { id: ev.id }, user: u });
  let rr = await patch(user, { billsListColumns: ["amount", "bogus", "billDate", "amount", "paid"] });
  check("any user with bills access can set the columns; junk is cleaned", rr.status === 200 && JSON.stringify(rr.json.billsListColumns) === JSON.stringify(["amount", "billDate", "paid", "status", "merchant"]), JSON.stringify(rr.json?.billsListColumns));
  rr = await getEv(u2);
  check("another user of the event sees the SAME columns", JSON.stringify(rr.json.billsListColumns) === JSON.stringify(["amount", "billDate", "paid", "status", "merchant"]));
  rr = await patch(outsider, { billsListColumns: ["status"] });
  check("a user without access to the event cannot change them (403)", rr.status === 403, String(rr.status));
  rr = await patch(u2, { billsListColumns: null });
  check("'restore default' (null) clears the choice for everyone", rr.status === 200 && rr.json.billsListColumns === null);
  rr = await getEv(user);
  check("after reset the list falls back to the default set", JSON.stringify(cols.normalizeBillColumns(rr.json.billsListColumns)) === JSON.stringify(cols.DEFAULT_BILL_COLUMNS));
  const billsRoute = await import("../src/app/api/events/[id]/bills/route");
  await prisma.bill.create({ data: { eventId: ev.id, gcsObjectPath: `t/${run}.pdf`, originalFilename: "c.pdf", contentHash: `c-${run}`, ingestChannel: "upload", createdByUserId: user.id, notes: "pozn." } });
  rr = await call(billsRoute.GET as unknown as Handler, { url: "/x", params: { id: ev.id }, user: u2 });
  check("bills list API carries the fields the columns need (note, paid, created by, exported)", rr.json[0].notes === "pozn." && "paidToAuthor" in rr.json[0] && "paidAt" in rr.json[0] && "exportedAt" in rr.json[0] && rr.json[0].createdBy?.displayName === "b-user");

  console.log("\n== Part 12: which event is current + move targets");
  const ce = await import("../src/lib/current-event");
  const evs = [{ id: "A", status: "active" }, { id: "B", status: "active" }, { id: "C", status: "closed" }];
  check("remembered active event B stays selected (also on Kurzy / Plátci / after reload)", ce.pickCurrentEvent(evs, "B", null) === "B");
  check("nothing remembered -> first selectable", ce.pickCurrentEvent(evs, null, null) === "A");
  check("remembered event no longer accessible/existing -> falls back to first active", ce.pickCurrentEvent(evs, "ZZZ", null) === "A");
  check("remembered event is closed and we're not on it -> falls back to first active", ce.pickCurrentEvent(evs, "C", null) === "A");
  check("closed event stays selectable while we are ON it (never a blank switcher)", ce.pickCurrentEvent(evs, "C", "C") === "C");
  check("no events at all -> null (no crash)", ce.pickCurrentEvent([], "B", null) === null);
  check("the switcher list offers active events only (plus the one being viewed)", JSON.stringify(ce.selectableEvents(evs, null).map((e) => e.id)) === '["A","B"]' && ce.selectableEvents(evs, "C").some((e) => e.id === "C"));

  const eventsRoute = await import("../src/app/api/events/route");
  const moveRoute = await import("../src/app/api/bills/[id]/move/route");
  const bulkRoute = await import("../src/app/api/events/[id]/bills/bulk/route");
  const mvA = await prisma.event.create({ data: { name: `MvA ${run}`, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-10") } });
  const mvOpen = await prisma.event.create({ data: { name: `MvOpen ${run}`, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-10") } });
  const mvClosed = await prisma.event.create({ data: { name: `MvClosed ${run}`, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-10"), status: "closed" } });
  const mvNoAccess = await prisma.event.create({ data: { name: `MvNoAccess ${run}`, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-10") } });
  const mvHealthOnly = await prisma.event.create({ data: { name: `MvHealth ${run}`, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-10") } });
  await prisma.userEventModuleAccess.createMany({
    data: [
      { userId: user.id, eventId: mvA.id, moduleKey: "bills" as const },
      { userId: user.id, eventId: mvOpen.id, moduleKey: "bills" as const },
      { userId: user.id, eventId: mvClosed.id, moduleKey: "bills" as const },
      { userId: user.id, eventId: mvHealthOnly.id, moduleKey: "health" as const },
    ],
    skipDuplicates: true,
  });
  rr = await call(eventsRoute.GET as unknown as Handler, { url: "/api/events?module=bills", user });
  const ids = (rr.json as { id: string }[]).map((e) => e.id);
  check("?module=bills lists only events with BILLS access (not the health-only or foreign ones)", ids.includes(mvOpen.id) && ids.includes(mvClosed.id) && !ids.includes(mvNoAccess.id) && !ids.includes(mvHealthOnly.id));
  const mkBill = (eventId: string, tag: string) => prisma.bill.create({ data: { eventId, gcsObjectPath: `t/${run}-${tag}.pdf`, originalFilename: `${tag}.pdf`, contentHash: `m-${run}-${tag}`, ingestChannel: "upload", createdByUserId: user.id } });
  const b1 = await mkBill(mvA.id, "one");
  rr = await call(moveRoute.POST as unknown as Handler, { url: "/x", method: "POST", params: { id: b1.id }, user, body: { targetEventId: mvClosed.id } });
  check("moving into a CLOSED event is refused server-side: target_event_closed", rr.status === 409 && rr.json.error === "target_event_closed", JSON.stringify(rr.json));
  rr = await call(moveRoute.POST as unknown as Handler, { url: "/x", method: "POST", params: { id: b1.id }, user, body: { targetEventId: mvNoAccess.id } });
  check("moving into an event without bills access is refused: target_no_access (403)", rr.status === 403 && rr.json.error === "target_no_access", JSON.stringify(rr.json));
  rr = await call(moveRoute.POST as unknown as Handler, { url: "/x", method: "POST", params: { id: b1.id }, user, body: { targetEventId: mvHealthOnly.id } });
  check("a health-only grant on the target is not enough", rr.status === 403);
  const stillThere = await prisma.bill.findUniqueOrThrow({ where: { id: b1.id } });
  check("refused moves leave the bill where it was", stillThere.eventId === mvA.id);
  rr = await call(bulkRoute.POST as unknown as Handler, { url: "/x", method: "POST", params: { id: mvA.id }, user, body: { action: "move", billIds: [b1.id], targetEventId: mvClosed.id } });
  check("bulk move into a closed event: reported per bill as target_event_closed", rr.status === 200 && rr.json.failedCount === 1 && rr.json.failed[0].error === "target_event_closed", JSON.stringify(rr.json));
  rr = await call(moveRoute.POST as unknown as Handler, { url: "/x", method: "POST", params: { id: b1.id }, user, body: { targetEventId: mvOpen.id } });
  const moved = await prisma.bill.findUniqueOrThrow({ where: { id: b1.id } });
  check("moving into an active event with bills access works", rr.status === 200 && moved.eventId === mvOpen.id, JSON.stringify(rr.json));

  console.log("\n== Part 14: manifest layout (one column pair per category)");
  const mf = await import("../src/lib/manifest");
  const dec = (n: string) => ({ toString: () => n });
  const mkB = (over: Partial<import("../src/lib/manifest").ManifestBill>): import("../src/lib/manifest").ManifestBill => ({
    billDate: new Date("2026-07-30T00:00:00Z"), merchantName: "Tesco", totalAmount: dec("900.00"), currency: "CZK", amountCzk: dec("900.00"),
    payerAuthorId: "p1", payerAuthor: { canonicalName: "Jana" }, paidToAuthor: true, exportFilename: "f.pdf", categories: [], ...over,
  });
  const three = mkB({ categories: [
    { amountCzk: dec("100.00"), eventCategory: { name: "Potraviny" } },
    { amountCzk: dec("300.00"), eventCategory: { name: "Hry" } },
    { amountCzk: dec("500.00"), eventCategory: { name: "Materiál" } },
  ] });
  const one = mkB({ merchantName: "Albert", totalAmount: dec("50.00"), amountCzk: dec("50.00"), payerAuthorId: null, payerAuthor: null, paidToAuthor: true, categories: [{ amountCzk: null, eventCategory: { name: "Potraviny" } }] });
  const none = mkB({ merchantName: "Bez kategorie", paidToAuthor: false, categories: [] });
  const table = mf.buildManifestRows([three, one, none], ["l1", "l2", "l3"]);
  check("header: fixed columns (Plátce, not Zaplatil) then 3 category pairs", JSON.stringify(table[0]) === JSON.stringify(["Datum", "Obchod", "Částka", "Měna", "Částka Kč", "Plátce", "Proplaceno", "Soubor", "Odkaz", "Kategorie 1", "Částka kat. 1 (Kč)", "Kategorie 2", "Částka kat. 2 (Kč)", "Kategorie 3", "Částka kat. 3 (Kč)"]), JSON.stringify(table[0]));
  check("no single joined 'Kategorie' column any more", !table[0].includes("Kategorie") && !table[0].includes("Zaplatil"));
  check("3-category bill: pairs in stable (name) order with their own CZK amounts", JSON.stringify(table[1].slice(9)) === JSON.stringify(["Hry", "300.00", "Materiál", "500.00", "Potraviny", "100.00"]), JSON.stringify(table[1].slice(9)));
  check("1-category bill: the pair equals the bill total (split row had no CZK amount)", table[2][9] === "Potraviny" && table[2][10] === "50.00" && table[2][11] === "" && table[2][12] === "" && table[2][13] === "" && table[2][14] === "", JSON.stringify(table[2].slice(9)));
  check("bill without categories: every pair empty", table[3].slice(9).every((c) => c === ""));
  check("every row has the same width as the header (no stale/short rows)", table.every((r) => r.length === table[0].length));
  check("'Proplaceno': Ano / Ne / Akce hradí přímo (not a bare 'Akce')", table[1][6] === "Ano" && table[3][6] === "Ne" && table[2][6] === "Akce hradí přímo", `${table[1][6]}|${table[3][6]}|${table[2][6]}`);
  check("payer column for an event-paid bill says so in words", table[2][5] === "Akce (bez proplacení)" && table[1][5] === "Jana");
  check("links land in the 'Odkaz' column", table[1][8] === "l1" && table[2][8] === "l2");
  const minimal = mf.buildManifestRows([none], [""]);
  check("no bill has categories -> still one pair (minimum)", minimal[0].length === 11 && minimal[0][9] === "Kategorie 1");
  check("empty event -> header only, one pair", mf.buildManifestRows([], []).length === 1 && mf.buildManifestRows([], [])[0].length === 11);

  void run;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
