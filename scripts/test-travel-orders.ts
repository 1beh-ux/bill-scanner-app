// Cestovní příkazy (prompt 7 B verify): the whole flow through the REAL route handlers, in a throwaway test
// organization that is deleted at the end (also on failure).
//   npx tsx --tsconfig tsconfig.travel-test.json scripts/test-travel-orders.ts --run      -- PDF service + GCS stubbed
//   npx tsx --tsconfig tsconfig.org-isolation.json scripts/test-travel-orders.ts --run    -- real PDF service + bucket
import { NextRequest } from "next/server";
import type { User } from "@/generated/prisma";

const TEST_ORG = "Test org (travel orders)";
type R = { ok: boolean; name: string; detail?: string };
const results: R[] = [];
const check = (name: string, ok: boolean, detail?: string) => results.push({ ok, name, detail: ok ? undefined : detail });
const req = (path: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`https://tabornik.online${path}`, { method: init?.method ?? "GET", headers: { host: "tabornik.online", "content-type": "application/json" }, body: init?.body === undefined ? undefined : JSON.stringify(init.body) });
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const json = async (res: Response) => ({ status: res.status, body: await res.json().catch(() => null) });
const asUser = (u: User | null) => ((globalThis as { __orgTestUser?: User | null }).__orgTestUser = u);

async function main() {
  if (!process.argv.includes("--run")) {
    console.log(`dry run: would create "${TEST_ORG}" (+ a second one), an event, two adults, two payers, cars, orders; check; delete. Rerun with --run.`);
    return;
  }
  const { prisma } = await import("@/lib/prisma");
  const { ensureDefaultTravelRates } = await import("@/lib/travel-rates-defaults");
  const stamp = Date.now();
  const org = await prisma.organization.create({ data: { name: TEST_ORG, shortName: "TravelTest", address: "Testovací 1, 110 00 Praha 1", ico: "12345678", city: "Praze" } });
  const org2 = await prisma.organization.create({ data: { name: `${TEST_ORG} 2`, shortName: "TravelTest2" } });
  let eventId: string | null = null;
  try {
    await ensureDefaultTravelRates(prisma, org.id);
    const admin = await prisma.user.create({ data: { email: `travel-test-${stamp}@test.invalid`, displayName: "Travel test", role: "admin", organizationId: org.id } });
    const admin2 = await prisma.user.create({ data: { email: `travel-test-2-${stamp}@test.invalid`, displayName: "Travel test 2", role: "admin", organizationId: org2.id } });
    asUser(admin);
    const events = await import("@/app/api/events/route");
    const ev = await json(await events.POST(req("/api/events", { method: "POST", body: { name: `Podzimky test ${stamp}`, startDate: "2026-10-23", endDate: "2026-10-27" } })));
    eventId = ev.body?.id;
    if (!eventId) throw new Error(`event not created: ${JSON.stringify(ev)}`);
    await prisma.eventModule.upsert({ where: { eventId_moduleKey: { eventId, moduleKey: "bills" } }, update: { enabled: true }, create: { eventId, moduleKey: "bills", enabled: true } }).catch(() => null);

    // Two adults on the event; two payers: "Pavel" linked to the adult, "Jakub" with the same name, not linked.
    const pavelC = await prisma.child.create({ data: { name: "Pavel Testovací", isAdult: true, organizationId: org.id, fieldValues: { adresa_ulice_cp: "Dlouhá 5", adresa_mesto: "Praha", adresa_psc: "110 00" } } });
    const kubaC = await prisma.child.create({ data: { name: "Jakub Testovací", isAdult: true, organizationId: org.id, guardians: { create: { email: `kuba-${stamp}@test.invalid`, phone: "777123456" } } } });
    for (const c of [pavelC, kubaC]) await prisma.eventPerson.create({ data: { eventId, childId: c.id } });
    const pavelA = await prisma.author.create({ data: { canonicalName: "Pavel Testovací", organizationId: org.id, childId: pavelC.id, bankAccountNumber: "2400222222", bankCode: "2010" } });
    const kubaA = await prisma.author.create({ data: { canonicalName: "Jakub Testovací", organizationId: org.id, bankAccountNumber: "123456789", bankCode: "0800" } });
    const other = await prisma.author.create({ data: { canonicalName: "Pokladník Testovací", organizationId: org.id, bankAccountNumber: "1111111111", bankCode: "0100" } });
    for (const a of [pavelA, kubaA, other]) await prisma.authorEventAccess.create({ data: { authorId: a.id, eventId } });
    const pavelCar = await prisma.vehicle.create({ data: { organizationId: org.id, label: "Škoda Octavia", plate: "1AB 2345", gearbox: "automatic", fuel: "petrol95", ownerChildId: pavelC.id } });
    const kubaCar = await prisma.vehicle.create({ data: { organizationId: org.id, label: "Kia Ceed", plate: "2CD 3456", cylinderCc: 1598, gearbox: "manual", fuel: "diesel", tpConsumption1: "4.0", ownerChildId: kubaC.id } });

    const list = await import("@/app/api/events/[id]/travel-orders/route");
    const options = await import("@/app/api/events/[id]/travel-orders/options/route");
    const one = await import("@/app/api/travel-orders/[id]/route");
    const submit = await import("@/app/api/travel-orders/[id]/submit/route");
    const reopen = await import("@/app/api/travel-orders/[id]/reopen/route");
    const billRoute = await import("@/app/api/bills/[id]/route");
    const billsList = await import("@/app/api/events/[id]/bills/route");

    // --- 7. the picker: Pavel once (linked), Jakub once with a same-name hint; his car offered via the adult.
    let o = await json(await options.GET(req(`/api/events/${eventId}/travel-orders/options`), params({ id: eventId })));
    const names = (o.body?.workers ?? []).map((w: { name: string }) => w.name);
    check("picker: one entry per person (Pavel, Jakub, the treasurer), the same-name payer flagged", names.length === 3 && names.filter((n: string) => n === "Jakub Testovací").length === 1 && o.body.workers.find((w: { name: string }) => w.name === "Jakub Testovací")?.sameNameAuthorId === kubaA.id, JSON.stringify(o.body?.workers));
    const pavelW = o.body.workers.find((w: { name: string }) => w.name === "Pavel Testovací");
    check("picker: Pavel = adult + linked payer, address from Lidé", pavelW?.childId === pavelC.id && pavelW?.authorId === pavelA.id && pavelW?.address === "Dlouhá 5, 110 00 Praha", JSON.stringify(pavelW));
    const kubaW = o.body.workers.find((w: { name: string }) => w.name === "Jakub Testovací");
    check("picker: Jakub's phone from his contact, normalized", kubaW?.phone === "+420 777 123 456", JSON.stringify(kubaW));
    await (await import("@/app/api/authors/[id]/route")).PATCH(req(`/api/authors/${kubaA.id}`, { method: "PATCH", body: { childId: kubaC.id } }), params({ id: kubaA.id }));
    o = await json(await options.GET(req(`/api/events/${eventId}/travel-orders/options`), params({ id: eventId })));
    const kubaW2 = o.body.workers.find((w: { name: string }) => w.name === "Jakub Testovací");
    check("Propojit: one linked entry, no hint any more", o.body.workers.length === 3 && kubaW2?.authorId === kubaA.id && !kubaW2?.sameNameAuthorId, JSON.stringify(o.body.workers));
    check("the adult's car is offered for the payer's order", o.body.vehicles.some((v: { id: string }) => v.id === kubaCar.id), JSON.stringify(o.body.vehicles.map((v: { id: string }) => v.id)));

    const newDraft = async () => (await json(await list.POST(req(`/api/events/${eventId}/travel-orders`, { method: "POST" }), params({ id: eventId! })))).body.id as string;
    const legs = (km: number[], date: string, times?: [string, string][]) => km.map((k, i) => ({ date, fromPlace: `A${i}`, toPlace: `A${i + 1}`, departTime: times?.[i]?.[0] ?? "", arriveTime: times?.[i]?.[1] ?? "", km: String(k), trailer: false, stravne: "", nocleh: "", vedlejsi: "" }));
    const fill = (w: { childId: string; authorId: string; name: string; bankAccountNumber: string; bankCode: string }, car: typeof pavelCar, start: string, end: string, l: unknown[]) => ({
      workerChildId: w.childId, workerAuthorId: w.authorId, workerName: w.name, workerAddress: "Adresa 1", workerPhone: "777 000 111", vehicleId: car.id, vehicleLabel: car.label, vehiclePlate: car.plate, cylinderCc: car.cylinderCc,
      fuel: car.fuel, gearbox: car.gearbox, tpValues: [car.tpConsumption1?.toString() ?? "", "", "", ""], payoutMethod: "bank", payoutName: w.name, payoutAccountNumber: w.bankAccountNumber, payoutBankCode: w.bankCode,
      purpose: "Podzimky", originPlace: "Praha", destinationPlace: "Tábor", roundTrip: true, startAt: start, endAt: end, approvalDate: "2026-10-20", approverName: "Vedoucí", coTravellers: "", freeMeals: { ubytovani: true }, legs: l,
    });

    // --- 2. a draft is not in the bills list
    const pavelOrder = await newDraft();
    let r = await json(await one.PATCH(req(`/api/travel-orders/${pavelOrder}`, { method: "PATCH", body: fill(pavelW, pavelCar, "2026-10-23T08:00", "2026-10-27T20:00", legs([152, 12, 12, 24, 24, 6, 6, 152], "2026-10-23")) }), params({ id: pavelOrder })));
    check("draft saved, live calc = 3 522.00 with the 2026-10-01 rates", r.status === 200 && r.body?.calc?.total === "3522.00" && r.body?.rate?.validFrom === "2026-10-01", JSON.stringify({ s: r.status, calc: r.body?.calc?.total, rate: r.body?.rate }));
    let bl = await json(await billsList.GET(req(`/api/events/${eventId}/bills`), params({ id: eventId })));
    const billsOf = (b: unknown) => (Array.isArray(b) ? b : (b as { bills?: unknown[] })?.bills ?? []) as { id: string; status: string; travelOrder?: { id: string } | null }[];
    check("a draft is not in the bills list", billsOf(bl.body).length === 0, JSON.stringify(bl.body)?.slice(0, 200));

    // --- 1. + 2. submit -> exactly one bill, never an AI status
    r = await json(await submit.POST(req(`/api/travel-orders/${pavelOrder}/submit`, { method: "POST" }), params({ id: pavelOrder })));
    const pavelBillId = r.body?.billId as string;
    check("Pavel submitted: one bill", r.status === 200 && !!pavelBillId, JSON.stringify(r));
    const pBill = pavelBillId ? await prisma.bill.findUniqueOrThrow({ where: { id: pavelBillId }, include: { categories: { include: { eventCategory: true } } } }) : null;
    check("bill: 3 522.00 CZK, payer Pavel, Doprava, to_review, travel_order, the PDF", !!pBill && pBill.amountCzk?.toString() === "3522" && pBill.payerAuthorId === pavelA.id && pBill.categories[0]?.eventCategory.name === "Doprava" && pBill.status === "to_review" && pBill.ingestChannel === "travel_order" && !!pBill.gcsObjectPath?.endsWith(".pdf"), JSON.stringify(pBill && { a: pBill.amountCzk, p: pBill.payerAuthorId, c: pBill.categories.map((c) => c.eventCategory.name), s: pBill.status, g: pBill.gcsObjectPath }));
    const html = (globalThis as { __lastPdfHtml?: string }).__lastPdfHtml ?? "";
    if (html) check("PDF: both pages, organization, IČ, V Praze dne, QR", html.includes("CESTOVNÍ PŘÍKAZ") && html.includes("VYÚČTOVÁNÍ PRACOVNÍ CESTY") && html.includes("IČ: 12345678") && html.includes("V Praze dne") && html.includes("data:image/png") && html.includes("3&nbsp;522,00") === false && /3\s522,00/.test(html), html.slice(0, 200));
    const { processBillWithAi } = await import("@/lib/process-bill-ai");
    const ai = await processBillWithAi(pavelBillId);
    const bulk = await json(await (await import("@/app/api/events/[id]/bills/bulk-ai/route")).POST(req(`/api/events/${eventId}/bills/bulk-ai`, { method: "POST", body: { billIds: [pavelBillId] } }), params({ id: eventId })));
    check("never the AI: direct call refused, bulk run skips it, status unchanged", !ai.ok && ai.error === "travel_order_no_ai" && bulk.status === 400 && (await prisma.bill.findUniqueOrThrow({ where: { id: pavelBillId } })).status === "to_review", JSON.stringify({ ai, bulk }));
    bl = await json(await billsList.GET(req(`/api/events/${eventId}/bills`), params({ id: eventId })));
    check("bills list: the bill points to its order (badge / opens the order)", billsOf(bl.body).find((b) => b.id === pavelBillId)?.travelOrder?.id === pavelOrder, JSON.stringify(billsOf(bl.body)).slice(0, 300));
    r = await json(await one.PATCH(req(`/api/travel-orders/${pavelOrder}`, { method: "PATCH", body: {} }), params({ id: pavelOrder })));
    check("a submitted order is read-only", r.status === 409, `HTTP ${r.status}`);
    const known = await prisma.knownDistance.findMany({ where: { organizationId: org.id } });
    check("known distances learned from the submitted legs", known.length === 8 && known.some((k) => k.fromPlace === "A0" && k.km.toString() === "152"), String(known.length));

    // --- 1. + 8. Kuba: 2 legs, diesel 44.50, TP 4.0 -> 2 534.50; his 14:00 leg before the 15:00 start warns, never blocks.
    const kubaOrder = await newDraft();
    const kubaBody = fill({ ...kubaW2, childId: kubaC.id }, kubaCar, "2026-10-23T15:00", "2026-10-27T20:00", legs([165, 165], "2026-10-23", [["14:00", "16:00"], ["17:00", "19:00"]]));
    r = await json(await one.PATCH(req(`/api/travel-orders/${kubaOrder}`, { method: "PATCH", body: kubaBody }), params({ id: kubaOrder })));
    const { orderWarnings } = await import("@/lib/travel-orders");
    const warn = orderWarnings(kubaBody.startAt, kubaBody.endAt, kubaBody.legs as never);
    check("Kuba: warning for the 14:00 leg against a 15:00 start", warn.some((w) => w.code === "leg_before_start" && w.leg === 0), JSON.stringify(warn));
    r = await json(await submit.POST(req(`/api/travel-orders/${kubaOrder}/submit`, { method: "POST" }), params({ id: kubaOrder })));
    const kubaBillId = r.body?.billId as string;
    const kBill = kubaBillId ? await prisma.bill.findUniqueOrThrow({ where: { id: kubaBillId } }) : null;
    check("Kuba submitted despite the warning: 2 534.50", r.status === 200 && kBill?.amountCzk?.toString() === "2534.5", JSON.stringify({ r, a: kBill?.amountCzk }));

    // --- 3. changing the rate set after submit changes nothing; Znovu otevřít recalculates with the frozen set.
    const set10 = await prisma.travelRateSet.findFirstOrThrow({ where: { organizationId: org.id, validFrom: new Date("2026-10-01") } });
    await prisma.travelRateSet.update({ where: { id: set10.id }, data: { dieselPrice: "60.00" } });
    r = await json(await one.GET(req(`/api/travel-orders/${kubaOrder}`), params({ id: kubaOrder })));
    check("after a rate edit the submitted order still shows 2 534.50 (frozen)", r.body?.calc?.total === "2534.50" && r.body?.rate?.frozen === true, JSON.stringify(r.body?.calc?.total));
    r = await json(await reopen.POST(req(`/api/travel-orders/${kubaOrder}/reopen`, { method: "POST" }), params({ id: kubaOrder })));
    const audit = await prisma.billAuditLog.count({ where: { billId: kubaBillId, actionType: "reopen", fieldName: "travel_order" } });
    r = await json(await one.GET(req(`/api/travel-orders/${kubaOrder}`), params({ id: kubaOrder })));
    check("Znovu otevřít: a draft, audited, still the frozen 44.50 -> 2 534.50", r.body?.order?.status === "draft" && audit === 1 && r.body?.calc?.total === "2534.50", JSON.stringify({ st: r.body?.order?.status, audit, t: r.body?.calc?.total }));
    r = await json(await submit.POST(req(`/api/travel-orders/${kubaOrder}/submit`, { method: "POST" }), params({ id: kubaOrder })));
    check("resubmit: the same bill, still one per order", r.body?.billId === kubaBillId && (await prisma.bill.count({ where: { eventId } })) === 2, JSON.stringify(r.body));
    await prisma.travelRateSet.update({ where: { id: set10.id }, data: { dieselPrice: "44.50" } });

    // --- 4. 2026-05-31 vs 2026-06-01: different diesel prices.
    const d1 = await newDraft();
    const d2 = await newDraft();
    const a = await json(await one.PATCH(req(`/api/travel-orders/${d1}`, { method: "PATCH", body: fill({ ...kubaW2, childId: kubaC.id }, kubaCar, "2026-05-31T08:00", "2026-05-31T20:00", legs([100], "2026-05-31")) }), params({ id: d1 })));
    const b = await json(await one.PATCH(req(`/api/travel-orders/${d2}`, { method: "PATCH", body: fill({ ...kubaW2, childId: kubaC.id }, kubaCar, "2026-06-01T08:00", "2026-06-01T20:00", legs([100], "2026-06-01")) }), params({ id: d2 })));
    check("2026-05-31 uses 34.10 (01 set), 2026-06-01 uses 44.50 (06 set)", a.body?.calc?.price === "34.10" && a.body?.rate?.validFrom === "2026-01-01" && b.body?.calc?.price === "44.50" && b.body?.rate?.validFrom === "2026-06-01", JSON.stringify([a.body?.calc?.price, a.body?.rate, b.body?.calc?.price, b.body?.rate]));

    // --- 5. no valid set: předběžná sazba on the draft, submit blocked with the date.
    const d3 = await newDraft();
    r = await json(await one.PATCH(req(`/api/travel-orders/${d3}`, { method: "PATCH", body: fill({ ...kubaW2, childId: kubaC.id }, kubaCar, "2025-12-15T08:00", "2025-12-15T20:00", legs([100], "2025-12-15")) }), params({ id: d3 })));
    check("no set for 2025-12-15: provisional rate on the draft", r.body?.rate?.provisional === true, JSON.stringify(r.body?.rate));
    r = await json(await submit.POST(req(`/api/travel-orders/${d3}/submit`, { method: "POST" }), params({ id: d3 })));
    check("submit blocked: no_rate_set with the date", r.status === 400 && r.body?.error === "no_rate_set" && r.body?.date === "2025-12-15", JSON.stringify(r));
    const d4 = await newDraft();
    r = await json(await submit.POST(req(`/api/travel-orders/${d4}/submit`, { method: "POST" }), params({ id: d4 })));
    check("submit blocked: no worker", r.status === 400 && r.body?.error === "no_worker", JSON.stringify(r));
    await one.PATCH(req(`/api/travel-orders/${d4}`, { method: "PATCH", body: { ...fill(pavelW, pavelCar, "2026-10-23T08:00", "2026-10-27T20:00", legs([10], "2026-10-23")), payoutAccountNumber: "" } }), params({ id: d4 }));
    r = await json(await submit.POST(req(`/api/travel-orders/${d4}/submit`, { method: "POST" }), params({ id: d4 })));
    check("submit blocked: bank payout without an account", r.status === 400 && r.body?.error === "payout_missing", JSON.stringify(r));

    // --- 6. payee change: payout + PDF change, worker and vehicle snapshots identical, audited.
    const snap = (x: Record<string, unknown>) => JSON.stringify(["workerName", "workerAddress", "workerPhone", "workerChildId", "workerAuthorId", "vehicleLabel", "vehiclePlate", "cylinderCc", "gearbox", "fuel", "tpValues", "vehicleId", "totalAmount", "rateValues"].map((k) => x[k]));
    const before = await prisma.travelOrder.findUniqueOrThrow({ where: { id: pavelOrder } });
    r = await json(await billRoute.PATCH(req(`/api/bills/${pavelBillId}`, { method: "PATCH", body: { payerAuthorId: other.id } }), params({ id: pavelBillId })));
    const after = await prisma.travelOrder.findUniqueOrThrow({ where: { id: pavelOrder } });
    const html2 = (globalThis as { __lastPdfHtml?: string }).__lastPdfHtml ?? "";
    const audits = await prisma.billAuditLog.findMany({ where: { billId: pavelBillId, fieldName: { in: ["payerAuthorId", "travel_order_payee"] } } });
    check("payee change: payout to the new payee, new PDF, snapshots identical, audited", r.status === 200 && after.payoutName === "Pokladník Testovací" && after.payoutAccountNumber === "1111111111" && after.pdfPath !== before.pdfPath && snap(before) === snap(after) && audits.length === 2 && (!html2 || html2.includes("Pokladník Testovací")), JSON.stringify({ s: r.status, after: after.payoutName, audits: audits.length, same: snap(before) === snap(after) }));
    r = await json(await billRoute.PATCH(req(`/api/bills/${pavelBillId}`, { method: "PATCH", body: { totalAmount: "1" } }), params({ id: pavelBillId })));
    check("the bill's amount can't be edited (it comes from the order)", r.status === 409, `HTTP ${r.status}`);

    // --- 10. approve + export prerequisites: approval works like any bill.
    const { approveBill } = await import("@/lib/bill-actions");
    const appr = await approveBill(pavelBillId, admin.id);
    check("the travel-order bill approves like any bill (display name for the export)", appr.ok, JSON.stringify(appr));
    r = await json(await reopen.POST(req(`/api/travel-orders/${pavelOrder}/reopen`, { method: "POST" }), params({ id: pavelOrder })));
    check("Znovu otevřít an approved one: bill back to review (never 'new')", r.status === 200 && (await prisma.bill.findUniqueOrThrow({ where: { id: pavelBillId } })).status === "to_review", JSON.stringify(r));

    // --- 9. isolation: another organization's admin gets 404 everywhere.
    asUser(admin2);
    const iso = [
      await one.GET(req(`/api/travel-orders/${pavelOrder}`), params({ id: pavelOrder })),
      await one.PATCH(req(`/api/travel-orders/${d1}`, { method: "PATCH", body: {} }), params({ id: d1 })),
      await one.DELETE(req(`/api/travel-orders/${d1}`, { method: "DELETE" }), params({ id: d1 })),
      await submit.POST(req(`/api/travel-orders/${d1}/submit`, { method: "POST" }), params({ id: d1 })),
      await reopen.POST(req(`/api/travel-orders/${kubaOrder}/reopen`, { method: "POST" }), params({ id: kubaOrder })),
      await (await import("@/app/api/travel-orders/[id]/calc/route")).POST(req(`/api/travel-orders/${d1}/calc`, { method: "POST", body: {} }), params({ id: d1 })),
      await list.GET(req(`/api/events/${eventId}/travel-orders`), params({ id: eventId })),
      await list.POST(req(`/api/events/${eventId}/travel-orders`, { method: "POST" }), params({ id: eventId })),
      await options.GET(req(`/api/events/${eventId}/travel-orders/options`), params({ id: eventId })),
    ].map((x) => x.status);
    check("another organization's admin: 404 on every travel-order route", iso.every((s) => s === 404), JSON.stringify(iso));
    check("…and nothing changed", (await prisma.travelOrder.count({ where: { eventId } })) === 6, String(await prisma.travelOrder.count({ where: { eventId } })));
    // A user without Bills access on the event: 403.
    asUser(admin);
    const plain = await prisma.user.create({ data: { email: `travel-test-user-${stamp}@test.invalid`, displayName: "Plain", role: "user", organizationId: org.id } });
    asUser(plain);
    const st = [(await one.GET(req(`/api/travel-orders/${pavelOrder}`), params({ id: pavelOrder }))).status, (await list.GET(req(`/api/events/${eventId}/travel-orders`), params({ id: eventId }))).status];
    check("no Bills access: 403", st.every((s) => s === 403), JSON.stringify(st));
    asUser(admin);

    // Deleting the bill makes the order a draft again.
    await billRoute.DELETE(req(`/api/bills/${kubaBillId}`, { method: "DELETE" }), params({ id: kubaBillId }));
    const k = await prisma.travelOrder.findUniqueOrThrow({ where: { id: kubaOrder } });
    check("bill deleted -> the order is a draft without a bill", k.status === "draft" && !k.billId, JSON.stringify({ s: k.status, b: k.billId }));

    // ===== 2026-11-03 changes =====
    // 6. a rate set chosen by hand: the 2026-01 set on an October trip -> 34.70 -> 3 312.50; submit allowed.
    const set01 = await prisma.travelRateSet.findFirstOrThrow({ where: { organizationId: org.id, validFrom: new Date("2026-01-01") } });
    const d5 = await newDraft();
    r = await json(await one.PATCH(req(`/api/travel-orders/${d5}`, { method: "PATCH", body: { ...fill(pavelW, pavelCar, "2026-10-23T08:00", "2026-10-27T20:00", legs([152, 12, 12, 24, 24, 6, 6, 152], "2026-10-23")), rateSetId: set01.id } }), params({ id: d5 })));
    check("rate chosen by hand: 2026-01 set on an October trip -> 3 312.50", r.body?.calc?.total === "3312.50" && r.body?.rate?.chosen === true, JSON.stringify({ t: r.body?.calc?.total, rate: r.body?.rate }));
    const pv = await json(await (await import("@/app/api/travel-orders/[id]/calc/route")).POST(req(`/api/travel-orders/${d5}/calc`, { method: "POST", body: { ...fill(pavelW, pavelCar, "2026-10-23T08:00", "2026-10-27T20:00", legs([152, 12, 12, 24, 24, 6, 6, 152], "2026-10-23")), rateSetId: "" } }), params({ id: d5 })));
    check("live calc back to 'by date' -> 3 522.00", pv.body?.calc?.total === "3522.00" && !pv.body?.rate?.chosen, JSON.stringify(pv.body?.calc?.total));
    // 8. Autoprovoz when the organization has it.
    await prisma.categoryTemplate.create({ data: { organizationId: org.id, name: "Autoprovoz" } });
    r = await json(await submit.POST(req(`/api/travel-orders/${d5}/submit`, { method: "POST" }), params({ id: d5 })));
    const cat5 = r.body?.billId ? await prisma.billCategory.findFirst({ where: { billId: r.body.billId }, include: { eventCategory: true } }) : null;
    check("submit with the chosen set; category Autoprovoz (from the template)", r.status === 200 && cat5?.eventCategory.name === "Autoprovoz" && cat5.amount.toString() === "3312.5", JSON.stringify({ r, c: cat5?.eventCategory.name }));
    // 7. editing a rate set sends its stored ISO date back unchanged.
    const rateOne = await import("@/app/api/travel-rates/[id]/route");
    const full = await prisma.travelRateSet.findUniqueOrThrow({ where: { id: set01.id } });
    r = await json(await rateOne.PATCH(req(`/api/travel-rates/${set01.id}`, { method: "PATCH", body: JSON.parse(JSON.stringify({ ...full, note: "upraveno" })) }), params({ id: set01.id })));
    check("rate set edit with the ISO validFrom from the list works", r.status === 200 && r.body?.note === "upraveno", JSON.stringify(r).slice(0, 200));
    // 3. the event's places; a known route either way round.
    const placesRoute = await import("@/app/api/events/[id]/travel-places/route");
    await placesRoute.POST(req(`/api/events/${eventId}/travel-places`, { method: "POST", body: { name: "Tábořiště  Lhota" } }), params({ id: eventId }));
    const pl = await json(await placesRoute.GET(req(`/api/events/${eventId}/travel-places`), params({ id: eventId })));
    check("places: added once, spaces tidied", JSON.stringify(pl.body?.map((x: { name: string }) => x.name)) === JSON.stringify(["Tábořiště Lhota"]), JSON.stringify(pl.body));
    const dist = await import("@/app/api/events/[id]/travel-orders/distance/route");
    r = await json(await dist.GET(req(`/api/events/${eventId}/travel-orders/distance?from=a1&to=A0`), params({ id: eventId })));
    check("route lookup: a known distance in the other direction", r.body?.km === 152 && r.body?.source === "known", JSON.stringify(r));
    // 9. templates (organization-wide) and copy for another worker.
    const tplRoute = await import("@/app/api/travel-templates/route");
    r = await json(await tplRoute.POST(req("/api/travel-templates", { method: "POST", body: { ...fill(pavelW, pavelCar, "2026-10-23T08:00", "2026-10-27T20:00", [...legs([165], "2026-10-23"), ...legs([165], "2026-10-25")]), eventId, name: "Praha – tábor" } })));
    const tl = await json(await tplRoute.GET());
    const tpl = tl.body?.[0];
    check("template saved: legs with day offsets, no worker / car / account", r.status === 201 && tpl?.data?.legs?.map((l: { dayOffset: number }) => l.dayOffset).join() === "0,2" && !JSON.stringify(tpl.data).includes("Pavel") && !JSON.stringify(tpl.data).includes("2400222222"), JSON.stringify(tpl));
    asUser(admin2);
    check("templates: another organization sees none", ((await json(await tplRoute.GET())).body ?? []).length === 0);
    asUser(admin);
    const cp = await json(await (await import("@/app/api/travel-orders/[id]/copy/route")).POST(req(`/api/travel-orders/${pavelOrder}/copy`, { method: "POST" }), params({ id: pavelOrder })));
    const copied = cp.body?.id ? await prisma.travelOrder.findUniqueOrThrow({ where: { id: cp.body.id }, include: { legs: true } }) : null;
    check("copy for another worker: same legs, no worker / car / bill", !!copied && copied.legs.length === 8 && !copied.workerName && !copied.vehicleId && !copied.billId && copied.status === "draft", JSON.stringify(copied && { l: copied.legs.length, w: copied.workerName }));
  } finally {
    asUser(null);
    const errors: string[] = [];
    const step = async (n: string, f: () => Promise<unknown>) => f().catch((e) => errors.push(`${n}: ${e instanceof Error ? e.message.split("\n").pop() : e}`));
    if (eventId) {
      const ev = { eventId };
      await step("travelOrder", () => prisma.travelOrder.deleteMany({ where: ev }));
      await step("billAuditLog", () => prisma.billAuditLog.deleteMany({ where: { bill: ev } }));
      await step("billCategory", () => prisma.billCategory.deleteMany({ where: { bill: ev } }));
      await step("bill", () => prisma.bill.deleteMany({ where: ev }));
      await step("eventCategory", () => prisma.eventCategory.deleteMany({ where: ev }));
      await step("authorBankAudit", () => prisma.authorBankAudit.deleteMany({ where: { author: { organizationId: org.id } } }));
      await step("authorEventAccess", () => prisma.authorEventAccess.deleteMany({ where: ev }));
      await step("eventModule", () => prisma.eventModule.deleteMany({ where: ev }));
      await step("userEventModuleAccess", () => prisma.userEventModuleAccess.deleteMany({ where: ev }));
      await step("eventListItem", () => prisma.eventListItem.deleteMany({ where: ev }));
      await step("eventEmailTemplate", () => prisma.eventEmailTemplate.deleteMany({ where: ev }));
      await step("eventParticipantField", () => prisma.eventParticipantField.deleteMany({ where: ev }));
      await step("event", () => prisma.event.deleteMany({ where: { id: eventId! } }));
    }
    for (const oid of [org.id, org2.id]) {
      const ov = { organizationId: oid };
      await step("knownDistance", () => prisma.knownDistance.deleteMany({ where: ov }));
      await step("travelTemplate", () => prisma.travelTemplate.deleteMany({ where: ov }));
      await step("categoryTemplate", () => prisma.categoryTemplate.deleteMany({ where: ov }));
      await step("vehicle", () => prisma.vehicle.deleteMany({ where: ov }));
      await step("travelRateSet", () => prisma.travelRateSet.deleteMany({ where: ov }));
      await step("author", () => prisma.author.deleteMany({ where: ov }));
      await step("childGuardian", () => prisma.childGuardian.deleteMany({ where: { child: ov } }));
      await step("child", () => prisma.child.deleteMany({ where: ov }));
      await step("userActivity", () => prisma.userActivity.deleteMany({ where: ov }));
      await step("user", () => prisma.user.deleteMany({ where: ov }));
      await step("organization", () => prisma.organization.delete({ where: { id: oid } }));
    }
    const left = await prisma.organization.count({ where: { name: { startsWith: TEST_ORG } } });
    console.log(`\ncleanup: ${errors.length ? `ERRORS -- ${errors.join("; ")}` : "ok"}; rows left: ${left}`);
    if (errors.length || left) process.exitCode = 1;
  }
  console.log("");
  for (const x of results) console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.name}${x.detail ? `   -- ${x.detail}` : ""}`);
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
