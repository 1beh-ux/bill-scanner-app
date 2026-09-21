// Scripted checks for the roles / payers work (docs/drive-payers-roles-change-notes.md):
// calls the real route handlers with a swappable "current user" against the LOCAL
// database. Refuses to run against anything but localhost.
//
//   npx tsx scripts/verify-payers-roles.ts
import { config } from "dotenv";
config({ path: ".env" });
import { NextRequest } from "next/server";

if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "")) {
  console.error("Refusing to run: DATABASE_URL is not local.");
  process.exit(1);
}

// -- swap the login check ------------------------------------------------
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
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { hasModuleAccess } = await import("../src/lib/module-access");
  const payersRoute = await import("../src/app/api/events/[id]/payers/route");
  const searchRoute = await import("../src/app/api/events/[id]/payers/search/route");
  const payerRoute = await import("../src/app/api/events/[id]/payers/[payerId]/route");
  const authorsRoute = await import("../src/app/api/authors/route");
  const authorRoute = await import("../src/app/api/authors/[id]/route");
  const mergeRoute = await import("../src/app/api/authors/[id]/merge/route");
  const auditRoute = await import("../src/app/api/authors/[id]/bank-audit/route");
  const eventsRoute = await import("../src/app/api/events/route");

  // -- fixtures (idempotent by name/email) --------------------------------
  const run = Date.now().toString(36);
  const mk = (email: string, role: "admin" | "accountant" | "user") =>
    prisma.user.upsert({ where: { email }, update: { role, active: true }, create: { email, displayName: email.split("@")[0], role } });
  const admin = await mk("v-admin@test.local", "admin");
  const user1 = await mk("v-user1@test.local", "user");
  const exAcct = await mk("v-acct@test.local", "accountant");
  const evA = await prisma.event.create({ data: { name: `V-A ${run}`, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-10") } });
  const evB = await prisma.event.create({ data: { name: `V-B ${run}`, startDate: new Date("2026-09-01"), endDate: new Date("2026-09-10") } });
  await prisma.userEventModuleAccess.createMany({
    data: [
      { userId: user1.id, eventId: evA.id, moduleKey: "bills" },
      { userId: exAcct.id, eventId: evA.id, moduleKey: "bills" },
      { userId: exAcct.id, eventId: evB.id, moduleKey: "bills" },
    ],
    skipDuplicates: true,
  });
  const A = { id: evA.id };
  const B = { id: evB.id };

  console.log("\n== roles");
  check("accountant without a grant has no bills access", !(await hasModuleAccess(exAcct, "00000000-0000-0000-0000-000000000000", "bills")));
  check("accountant with grants has bills on A and B", (await hasModuleAccess(exAcct, evA.id, "bills")) && (await hasModuleAccess(exAcct, evB.id, "bills")));
  check("standard user (event A only) has no access to B", !(await hasModuleAccess(user1, evB.id, "bills")));
  let r = await call(eventsRoute.GET as unknown as Handler, { url: "/api/events", user: user1 });
  // (earlier runs leave their own granted events behind, so look at this run's events only)
  const mine = (r.json ?? []).filter((e: { name: string }) => e.name.includes(run));
  check("event list for standard user = only granted events (A yes, B no)", r.status === 200 && mine.length === 1 && mine[0].id === evA.id, JSON.stringify(mine.map((e: { name: string }) => e.name)));
  r = await call(eventsRoute.GET as unknown as Handler, { url: "/api/events", user: admin });
  check("event list for admin includes A and B", r.json.some((e: { id: string }) => e.id === evA.id) && r.json.some((e: { id: string }) => e.id === evB.id));

  console.log("\n== global payer endpoints are admin only");
  const anyAuthor = await prisma.author.create({ data: { canonicalName: `Global ${run}` } });
  for (const [label, h, opts] of [
    ["GET /api/authors", authorsRoute.GET, { url: "/api/authors" }],
    ["POST /api/authors", authorsRoute.POST, { url: "/api/authors", method: "POST", body: { canonicalName: "x" } }],
    ["PATCH /api/authors/[id]", authorRoute.PATCH, { url: "/x", method: "PATCH", body: { canonicalName: "y" }, params: { id: anyAuthor.id } }],
    ["DELETE /api/authors/[id]", authorRoute.DELETE, { url: "/x", method: "DELETE", params: { id: anyAuthor.id } }],
    ["POST /api/authors/[id]/merge", mergeRoute.POST, { url: "/x", method: "POST", body: { targetAuthorId: anyAuthor.id }, params: { id: anyAuthor.id } }],
    ["GET /api/authors/[id]/bank-audit", auditRoute.GET, { url: "/x", params: { id: anyAuthor.id } }],
  ] as const) {
    const res = await call(h as unknown as Handler, { ...opts, user: user1 } as Parameters<typeof call>[1]);
    check(`${label}: standard user -> 403 admin_only`, res.status === 403 && res.json?.error === "admin_only", `${res.status} ${JSON.stringify(res.json)}`);
  }
  r = await call(authorsRoute.GET as unknown as Handler, { url: "/api/authors", user: admin });
  check("GET /api/authors: admin -> 200", r.status === 200);

  console.log("\n== event-scoped payers");
  r = await call(payersRoute.GET as unknown as Handler, { url: "/x", params: A, user: user1 });
  check("event user lists payers of A", r.status === 200 && Array.isArray(r.json));
  r = await call(payersRoute.GET as unknown as Handler, { url: "/x", params: B, user: user1 });
  check("event user cannot list payers of B (no access)", r.status === 403, String(r.status));

  r = await call(payersRoute.POST as unknown as Handler, { url: "/x", method: "POST", params: A, user: user1, body: { canonicalName: `Jana Nováková ${run}`, bankAccountNumber: "123456789", bankCode: "0800" } });
  check("create payer with bank details", r.status === 201 && r.json?.bankCode === "0800", JSON.stringify(r.json));
  const janaId: string = r.json?.id;

  r = await call(payersRoute.POST as unknown as Handler, { url: "/x", method: "POST", params: A, user: user1, body: { canonicalName: `  jana   NOVAKOVA ${run} ` } });
  check("similar name (case/diacritics) -> 409 similar_payer_exists", r.status === 409 && r.json?.error === "similar_payer_exists" && r.json.similar?.[0]?.id === janaId, JSON.stringify(r.json));
  check("similar list carries names only (no bank details)", r.json?.similar?.every((s: object) => !("bankAccountNumber" in s)));
  r = await call(payersRoute.POST as unknown as Handler, { url: "/x", method: "POST", params: A, user: user1, body: { canonicalName: `Nováková ${run} Jana` } });
  check("word-order variant is also flagged", r.status === 409, String(r.status));

  r = await call(payersRoute.POST as unknown as Handler, { url: "/x", method: "POST", params: A, user: user1, body: { canonicalName: "Bad Bank", bankAccountNumber: "12", bankCode: "99" } });
  check("invalid bank account rejected", r.status === 400 && r.json?.error === "invalid_bank_account", JSON.stringify(r.json));
  r = await call(payersRoute.POST as unknown as Handler, { url: "/x", method: "POST", params: A, user: user1, body: { canonicalName: "Half Bank", bankAccountNumber: "123456789" } });
  check("account without bank code rejected", r.status === 400 && r.json?.error === "bank_incomplete", JSON.stringify(r.json));

  r = await call(payerRoute.PATCH as unknown as Handler, { url: "/x", method: "PATCH", params: { ...A, payerId: janaId }, user: user1, body: { bankAccountNumber: "19-2000145399", bankCode: "0800" } });
  check("event user edits bank details", r.status === 200 && r.json?.bankAccountNumber === "19-2000145399", JSON.stringify(r.json));
  const audits = await prisma.authorBankAudit.findMany({ where: { authorId: janaId }, orderBy: { createdAt: "asc" } });
  check("audit rows: create + event_edit", audits.length === 2 && audits[0].source === "create" && audits[1].source === "event_edit", audits.map((a) => a.source).join(","));
  check("audit records old -> new, user and event", audits[1]?.oldBankAccountNumber === "123456789" && audits[1]?.newBankAccountNumber === "19-2000145399" && audits[1]?.changedByUserId === user1.id && audits[1]?.eventId === evA.id);
  r = await call(payerRoute.PATCH as unknown as Handler, { url: "/x", method: "PATCH", params: { ...A, payerId: janaId }, user: user1, body: { bankAccountNumber: "19-2000145399", bankCode: "0800" } });
  const audits2 = await prisma.authorBankAudit.count({ where: { authorId: janaId } });
  check("saving an unchanged bank account writes no new audit row", r.status === 200 && audits2 === 2, String(audits2));

  // a payer that lives only in event B is invisible/untouchable from A
  const bPayer = await prisma.author.create({ data: { canonicalName: `Only-B ${run}` } });
  await prisma.authorEventAccess.create({ data: { authorId: bPayer.id, eventId: evB.id } });
  r = await call(payerRoute.PATCH as unknown as Handler, { url: "/x", method: "PATCH", params: { ...A, payerId: bPayer.id }, user: user1, body: { canonicalName: "hijack" } });
  check("event user cannot edit a payer that is not attached to their event", r.status === 404, String(r.status));
  r = await call(payersRoute.GET as unknown as Handler, { url: "/x", params: A, user: user1 });
  check("event A list does not contain event B's payer", !r.json.some((p: { id: string }) => p.id === bPayer.id));

  // search shows names only, and only unattached
  r = await call(searchRoute.GET as unknown as Handler, { url: `/x?q=only-b ${run}`, params: A, user: user1 });
  check("search finds unattached payer by name, names only", r.status === 200 && r.json?.[0]?.id === bPayer.id && !("bankAccountNumber" in r.json[0]), JSON.stringify(r.json));
  r = await call(payersRoute.POST as unknown as Handler, { url: "/x", method: "POST", params: A, user: user1, body: { authorId: bPayer.id } });
  check("attach existing payer by id", r.status === 201);
  r = await call(searchRoute.GET as unknown as Handler, { url: `/x?q=only-b ${run}`, params: A, user: user1 });
  check("attached payer no longer offered by search", r.json?.length === 0);

  // removal keeps the bills
  const bill = await prisma.bill.create({
    data: { eventId: evA.id, gcsObjectPath: `test/${run}.pdf`, originalFilename: "t.pdf", contentHash: `h-${run}`, ingestChannel: "upload", createdByUserId: user1.id, payerAuthorId: janaId },
  });
  r = await call(payerRoute.DELETE as unknown as Handler, { url: "/x", method: "DELETE", params: { ...A, payerId: janaId }, user: user1 });
  check("removing a payer that has bills asks for confirmation (409 payer_has_bills)", r.status === 409 && r.json?.error === "payer_has_bills" && r.json?.billCount === 1, JSON.stringify(r.json));
  r = await call(payerRoute.DELETE as unknown as Handler, { url: "/x?confirm=true", method: "DELETE", params: { ...A, payerId: janaId }, user: user1 });
  check("confirmed removal succeeds", r.status === 200);
  const billAfter = await prisma.bill.findUniqueOrThrow({ where: { id: bill.id } });
  check("existing bill keeps its payer", billAfter.payerAuthorId === janaId);
  r = await call(payersRoute.GET as unknown as Handler, { url: "/x", params: A, user: user1 });
  check("removed payer disappears from the event's list", !r.json.some((p: { id: string }) => p.id === janaId));
  check("global payer record still exists", (await prisma.author.count({ where: { id: janaId } })) === 1);

  // admin-only global edit is audited too, merge override is audited
  r = await call(authorRoute.PATCH as unknown as Handler, { url: "/x", method: "PATCH", params: { id: janaId }, user: admin, body: { bankAccountNumber: "35-1234567", bankCode: "0100" } });
  const adminAudit = await prisma.authorBankAudit.findFirst({ where: { authorId: janaId, source: "admin_edit" } });
  check("admin edit writes an admin_edit audit row without an event", r.status === 200 && adminAudit?.eventId === null);
  const mergeTarget = await prisma.author.create({ data: { canonicalName: `Merge target ${run}` } });
  r = await call(mergeRoute.POST as unknown as Handler, { url: "/x", method: "POST", params: { id: janaId }, user: admin, body: { targetAuthorId: mergeTarget.id, bankAccountNumber: "35-1234567", bankCode: "0100" } });
  const mergeAudit = await prisma.authorBankAudit.findFirst({ where: { authorId: mergeTarget.id, source: "merge" } });
  check("merge with bank details on the survivor writes a merge audit row", r.status === 200 && !!mergeAudit);
  r = await call(auditRoute.GET as unknown as Handler, { url: "/x", params: { id: janaId }, user: admin });
  check("admin can read the bank history of a payer", r.status === 200 && r.json.length >= 3, `${r.json?.length}`);
  r = await call(payerRoute.PATCH as unknown as Handler, { url: "/x", method: "PATCH", params: { ...A, payerId: janaId }, user: user1, body: { canonicalName: "zombie" } });
  check("merged/inactive payer cannot be edited from an event", r.status === 404, String(r.status));

  console.log("\n== bill payer must belong to the bill's event");
  const billsRoute = await import("../src/app/api/bills/[id]/route");
  const bill2 = await prisma.bill.create({
    data: { eventId: evA.id, gcsObjectPath: `test/${run}-2.pdf`, originalFilename: "t2.pdf", contentHash: `h2-${run}`, ingestChannel: "upload", createdByUserId: user1.id },
  });
  const inB = await prisma.author.create({ data: { canonicalName: `Payer of B only ${run}` } });
  await prisma.authorEventAccess.create({ data: { authorId: inB.id, eventId: evB.id } });
  r = await call(billsRoute.PATCH as unknown as Handler, { url: "/x", method: "PATCH", params: { id: bill2.id }, user: user1, body: { payerAuthorId: inB.id } });
  check("assigning a payer from another event is rejected (payer_not_in_event)", r.status === 400 && r.json?.error === "payer_not_in_event", JSON.stringify(r.json));
  const inA = await prisma.author.create({ data: { canonicalName: `Payer of A ${run}` } });
  await prisma.authorEventAccess.create({ data: { authorId: inA.id, eventId: evA.id } });
  r = await call(billsRoute.PATCH as unknown as Handler, { url: "/x", method: "PATCH", params: { id: bill2.id }, user: user1, body: { payerAuthorId: inA.id } });
  check("assigning a payer attached to the event works", r.status === 200, JSON.stringify(r.json));

  console.log("\n== payments page data is scoped to the selected event");
  const unpaidRoute = await import("../src/app/api/events/[id]/unpaid-summary/route");
  const payerA = await prisma.author.create({ data: { canonicalName: `Pay A ${run}` } });
  const payerB = await prisma.author.create({ data: { canonicalName: `Pay B ${run}` } });
  await prisma.authorEventAccess.createMany({ data: [{ authorId: payerA.id, eventId: evA.id }, { authorId: payerB.id, eventId: evB.id }] });
  const mkBill = (eventId: string, payerId: string, tag: string, paid: boolean, status: "approved" | "new" = "approved") =>
    prisma.bill.create({
      data: { eventId, gcsObjectPath: `test/${run}-${tag}.pdf`, originalFilename: `${tag}.pdf`, contentHash: `h-${run}-${tag}`, ingestChannel: "upload", createdByUserId: user1.id, payerAuthorId: payerId, paidToAuthor: paid, status, totalAmount: "100", amountCzk: "100", currency: "CZK", merchantName: tag },
    });
  await mkBill(evA.id, payerA.id, "a-unpaid", false);
  await mkBill(evA.id, payerA.id, "a-paid", true);
  await mkBill(evA.id, payerA.id, "a-new-unpaid", false, "new");
  await mkBill(evB.id, payerB.id, "b-unpaid", false);
  for (const who of [admin, exAcct]) {
    r = await call(unpaidRoute.GET as unknown as Handler, { url: "/x?scope=approved", params: A, user: who });
    check(`payments (${who.role}) for event A shows only A's payer`, r.status === 200 && r.json.length === 1 && r.json[0].authorId === payerA.id, JSON.stringify(r.json?.map((x: { name: string }) => x.name)));
  }
  r = await call(unpaidRoute.GET as unknown as Handler, { url: "/x?scope=approved", params: A, user: admin });
  check("approved tab: unpaid approved bills only (1 bill)", r.json[0].unpaidBillCount === 1 && r.json[0].items.length === 1 && r.json[0].paidBillCount === 0, JSON.stringify(r.json[0]));
  const rowOf = (json: { authorId: string }[], id: string) => json.find((x) => x.authorId === id) as
    | { items: { paid: boolean }[]; unpaidTotalCzk: string; paidTotalCzk: string; lastBankChange: { byName: string } | null; attached: boolean }
    | undefined;
  r = await call(unpaidRoute.GET as unknown as Handler, { url: "/x?scope=all", params: A, user: admin });
  let rowA = rowOf(r.json, payerA.id);
  check("all tab: lists paid AND unpaid bills of any status (3 items)", rowA?.items.length === 3 && rowA.items.some((i) => i.paid) && rowA.items.some((i) => !i.paid), JSON.stringify(rowA?.items));
  check("all tab: unpaid total excludes the paid bill (200 Kč unpaid, 100 Kč paid)", parseFloat(rowA?.unpaidTotalCzk ?? "") === 200 && parseFloat(rowA?.paidTotalCzk ?? "") === 100, `${rowA?.unpaidTotalCzk}/${rowA?.paidTotalCzk}`);
  check("all tab: nothing from event B leaks in", !rowOf(r.json, payerB.id));
  r = await call(unpaidRoute.GET as unknown as Handler, { url: "/x?scope=all", params: B, user: user1 });
  check("event user has no payments access to event B", r.status === 403, String(r.status));
  // bank hint data + removed-from-event flag
  await call(payerRoute.PATCH as unknown as Handler, { url: "/x", method: "PATCH", params: { ...A, payerId: payerA.id }, user: user1, body: { bankAccountNumber: "123456789", bankCode: "0800" } });
  r = await call(unpaidRoute.GET as unknown as Handler, { url: "/x?scope=all", params: A, user: admin });
  rowA = rowOf(r.json, payerA.id);
  check("payments row carries the latest bank change (who/when)", rowA?.lastBankChange?.byName === user1.displayName, JSON.stringify(rowA?.lastBankChange));
  check("payer attached to the event is flagged attached:true", rowA?.attached === true);
  await prisma.authorEventAccess.delete({ where: { authorId_eventId: { authorId: payerA.id, eventId: evA.id } } });
  r = await call(unpaidRoute.GET as unknown as Handler, { url: "/x?scope=all", params: A, user: admin });
  rowA = rowOf(r.json, payerA.id);
  check("payer removed from the event is still listed while owed, flagged attached:false", !!rowA && rowA.attached === false);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
