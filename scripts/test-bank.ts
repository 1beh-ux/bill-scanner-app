// Banka end-to-end checks against the database (docs/bank-reconciliation.md "A — verify"), in a
// throwaway organization that is deleted afterwards. Route handlers are called directly with a
// stubbed signed-in user (same harness as scripts/test-org-isolation.ts):
//   npx tsx --tsconfig tsconfig.org-isolation.json scripts/test-bank.ts
import { NextRequest } from "next/server";
import type { User } from "@/generated/prisma";

const ORG = "Test org (bank)";
type R = { ok: boolean; name: string; detail?: string };
const results: R[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => results.push({ ok, name, detail: ok ? undefined : JSON.stringify(detail).slice(0, 2500) });
const req = (path: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`https://tabornik.online${path}`, { method: init?.method ?? "GET", headers: { host: "tabornik.online", "content-type": "application/json" }, body: init?.body === undefined ? undefined : JSON.stringify(init.body) });
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const json = async (res: Response) => ({ status: res.status, body: await res.json().catch(() => null) });
const asUser = (u: User | null) => ((globalThis as { __orgTestUser?: User | null }).__orgTestUser = u);

// CP1250, info lines on top, header on line 4, Czech numbers, debit/credit columns.
function cp1250(text: string) {
  const map: Record<string, number> = { "ý": 0xfd, "ú": 0xfa, "č": 0xe8, "Č": 0xc8, "á": 0xe1, "í": 0xed, "ř": 0xf8, "é": 0xe9, "ž": 0x9e, "ě": 0xec, "š": 0x9a, "ů": 0xf9, "Ú": 0xda, "Š": 0x8a, "Ž": 0x8e, "Ř": 0xd8, "ó": 0xf3 };
  return Buffer.from([...text].map((ch) => (ch.charCodeAt(0) < 128 ? ch.charCodeAt(0) : map[ch] ?? 0x3f))).toString("base64");
}
const header = ["Výpis z účtu;2400111111/0800", "Období;1.7.2026 - 31.7.2026", "", "Datum;Název protiúčtu;Protiúčet;VS;Zpráva pro příjemce;Výdaj;Příjem;Typ"];
const rowsA = [
  "03.07.2026;ALBERT CR;;;Nákup potravin;1 234,50;;Platba kartou",
  "04.07.2026;Kavárna;;;Káva;45,00;;Platba kartou",
  "04.07.2026;Kavárna;;;Káva;45,00;;Platba kartou",
  "05.07.2026;;;;Výběr z bankomatu Praha;2 000,00;;Výběr z bankomatu",
  "05.07.2026;;;;Poplatek za vedení účtu;49,00;;Poplatek",
  "06.07.2026;Hlavní účet;2400222222/2010;;Převod na tábor;;10 000,00;Bezhotovostní příjem",
  "07.07.2026;NOVAKOVA JANA;123456789/0800;;Proplacení;300,00;;Bezhotovostní platba",
  "08.07.2026;Rodič;55555/0100;77;Táborový poplatek;;3 500,00;Bezhotovostní příjem",
  "09.07.2026;Biedronka;;;Zakupy;553,00;;Platba kartou",
  "20.08.2026;Mimo;;;Pozdě;10,00;;Platba kartou",
  "10.07.2026;Chyba;;;;neplatné;;",
];

async function main() {
  const { prisma } = await import("@/lib/prisma");
  const { Prisma } = await import("@/generated/prisma");
  const stamp = Date.now();
  const org = await prisma.organization.create({ data: { name: ORG, shortName: "TestB", contactEmail: null } });
  let eventId = "";
  try {
    const mk = (name: string, role: "admin" | "user") => prisma.user.create({ data: { email: `bank-${name}-${stamp}@test.invalid`, displayName: name, role, organizationId: org.id } });
    const [admin, banker, billsOnly] = [await mk("admin", "admin"), await mk("banker", "user"), await mk("bills", "user")];
    const ev = await prisma.event.create({ data: { name: `Bank ${stamp}`, organizationId: org.id, startDate: new Date("2026-07-01"), endDate: new Date("2026-07-14") } });
    eventId = ev.id;
    await prisma.eventModule.createMany({ data: [{ eventId, moduleKey: "bills", enabled: true }, { eventId, moduleKey: "bank", enabled: true }] });
    await prisma.userEventModuleAccess.createMany({ data: [{ userId: banker.id, eventId, moduleKey: "bills" }, { userId: banker.id, eventId, moduleKey: "bank" }, { userId: billsOnly.id, eventId, moduleKey: "bills" }] });
    // The organization's own account (-> Převod).
    await prisma.bankAccount.create({ data: { organizationId: org.id, label: "Hlavní", accountNumber: "2400222222", bankCode: "2010" } });
    const cat = await prisma.eventCategory.create({ data: { eventId, name: "Potraviny", budgetAmount: new Prisma.Decimal(0) } });
    const jana = await prisma.author.create({ data: { organizationId: org.id, canonicalName: "Jana Nováková", bankAccountNumber: "123456789", bankCode: "0800" } });
    await prisma.participant.create({ data: { eventId, name: "Dítě Test", acceptedVariableSymbol: "77" } as never }).catch(() => null);
    const bill = (tag: string, czk: number, date: string, o: Record<string, unknown> = {}) =>
      prisma.bill.create({ data: { eventId, gcsObjectPath: `t/${stamp}-${tag}`, originalFilename: `${tag}.pdf`, contentHash: `b-${stamp}-${tag}`, ingestChannel: "upload", createdByUserId: banker.id, status: "to_review", merchantName: tag, billDate: new Date(date), totalAmount: new Prisma.Decimal(czk), amountCzk: new Prisma.Decimal(czk), ...o } });
    const bAlbert = await bill("Albert", 1234.5, "2026-07-02");
    const bCafe1 = await bill("Cafe1", 45, "2026-07-04");
    const bCafe2 = await bill("Cafe2", 45, "2026-07-04");
    const bJana = await bill("JanaBill", 300, "2026-07-03", { payerAuthorId: jana.id, paidToAuthor: false });
    await bill("Biedronka", 540, "2026-07-08", { currency: "PLN", totalAmount: new Prisma.Decimal(95) });
    await prisma.billCategory.create({ data: { billId: bAlbert.id, eventCategoryId: cat.id, amount: new Prisma.Decimal(1234.5), amountCzk: new Prisma.Decimal(1234.5) } });

    const R = {
      accounts: await import("@/app/api/events/[id]/bank/accounts/route"),
      imp: await import("@/app/api/events/[id]/bank/import/route"),
      txs: await import("@/app/api/events/[id]/bank/transactions/route"),
      act: await import("@/app/api/events/[id]/bank/transactions/actions/route"),
      overview: await import("@/app/api/events/[id]/bank/overview/route"),
      pairing: await import("@/app/api/events/[id]/bank/pairing/[txId]/route"),
      matches: await import("@/app/api/events/[id]/bank/matches/[matchId]/route"),
      bills: await import("@/app/api/events/[id]/bills/route"),
      payment: await import("@/app/api/bills/[id]/payment/route"),
    };
    const p = params({ id: eventId });

    // --- 8. access: bills-only user and an admin without the grant -> 403 everywhere in /bank
    for (const [who, u] of [["bills-only user", billsOnly], ["admin without the bank grant", admin]] as const) {
      asUser(u);
      const st = [
        (await R.accounts.GET(req("/x"), p)).status,
        (await R.txs.GET(req("/x"), p)).status,
        (await R.overview.GET(req("/x"), p)).status,
        (await R.imp.POST(req("/x", { method: "POST", body: { source: "paste", text: "a" } }), p)).status,
        (await R.act.POST(req("/x", { method: "POST", body: { action: "suggest" } }), p)).status,
      ];
      check(`${who}: every /bank API -> 403`, st.every((x) => x === 403), st);
    }

    // --- account + import (as the banker)
    asUser(banker);
    const created = await json(await R.accounts.POST(req("/x", { method: "POST", body: { label: "Táborový", accountNumber: "2400111111", bankCode: "0800", sourceType: "file" } }), p));
    const accountId = created.body?.id;
    check("account created and linked (window = event dates)", created.status === 201 && !!accountId, created);
    const file = { accountId, source: "file", base64: cp1250([...header, ...rowsA].join("\r\n")), fileName: "vypis.csv" };
    const preview = await json(await R.imp.POST(req("/x", { method: "POST", body: file }), p));
    check("1. CP1250 CSV, header on line 4: preview Nové 9 · Mimo období 1 · Chyba 1", preview.body?.headerRow === 2 && JSON.stringify(preview.body?.counts) === JSON.stringify({ new: 9, duplicate: 0, outside: 1, error: 1 }), preview.body?.counts ?? preview);
    const done = await json(await R.imp.POST(req("/x", { method: "POST", body: { ...file, commit: true } }), p));
    check("1. import: 9 new rows stored", done.body?.counts?.new === 9 && (await prisma.bankTransaction.count({ where: { eventId } })) === 9, done.body);
    const again = await json(await R.imp.POST(req("/x", { method: "POST", body: { ...file, commit: true } }), p));
    check("1. re-import: all rows Duplicita", again.body?.counts?.new === 0 && again.body?.counts?.duplicate === 9, again.body?.counts);

    const tx = async (msg: string) => (await prisma.bankTransaction.findFirstOrThrow({ where: { eventId, message: { contains: msg } } }));
    // --- 4. classification
    const cls = async (m: string) => (await tx(m)).classification;
    check("4. ATM -> Pokladna, fee -> Poplatek, own account -> Převod, participant VS -> Příjem/poplatek", (await cls("bankomatu")) === "cash" && (await cls("vedení")) === "fee" && (await cls("Převod")) === "transfer" && (await tx("Táborový")).incomeType === "fee", { atm: await cls("bankomatu"), fee: await cls("vedení"), own: await cls("Převod"), vs: (await tx("Táborový")).incomeType });
    const fee = await tx("vedení");
    await R.act.POST(req("/x", { method: "POST", body: { action: "classify", ids: [fee.id], classification: "private" } }), p);
    await R.imp.POST(req("/x", { method: "POST", body: { ...file, base64: cp1250([...header, ...rowsA, "11.07.2026;Nový;;;Nový řádek;10,00;;Platba kartou"].join("\r\n")), commit: true } }), p);
    check("4. a manual change survives a re-import", (await prisma.bankTransaction.findUniqueOrThrow({ where: { id: fee.id } })).classification === "private" && (await prisma.bankTransaction.count({ where: { eventId } })) === 10);

    // --- 5. suggestions
    const sug = (txId: string) => prisma.bankMatch.findMany({ where: { transactionId: txId, confirmedAt: null, rejectedAt: null } });
    const albert = await tx("Nákup potravin");
    const [cafe] = await prisma.bankTransaction.findMany({ where: { eventId, message: "Káva" } });
    const bied = await tx("Zakupy");
    check("5. unique exact pair -> Jistý", (await sug(albert.id)).length === 1 && (await sug(albert.id))[0].tier === "sure" && (await sug(albert.id))[0].billId === bAlbert.id, await sug(albert.id));
    check("5. two equal amounts -> Možný (not sure)", (await sug(cafe.id)).length === 2 && (await sug(cafe.id)).every((m) => m.tier === "possible"), await sug(cafe.id));
    check("5. PLN bill vs CZK payment within 3 % -> suggested", (await sug(bied.id)).length === 1, await sug(bied.id));
    check("5. nothing confirmed before a person confirms", (await prisma.bankMatch.count({ where: { transaction: { eventId }, confirmedAt: { not: null } } })) === 0);
    const billsList = await json(await R.bills.GET(req("/x"), p));
    check("5. a suggestion shows only as Návrh in Účtenky", (billsList.body as { id: string; payment: { state: string } }[]).find((b) => b.id === bAlbert.id)?.payment.state === "suggested");
    const surePreview = await json(await R.act.POST(req("/x", { method: "POST", body: { action: "confirmPreview", sure: true } }), p));
    const sureCount = await prisma.bankMatch.count({ where: { transaction: { eventId }, tier: "sure", confirmedAt: null } });
    const conf = await json(await R.act.POST(req("/x", { method: "POST", body: { action: "confirm", sure: true } }), p));
    check("5. Potvrdit všechny jisté confirms exactly the sure ones", conf.body?.confirmed === sureCount && surePreview.body?.count === sureCount && (await prisma.bankMatch.count({ where: { transaction: { eventId }, confirmedAt: { not: null } } })) === sureCount, { conf: conf.body, sureCount });
    const rejectId = (await sug(cafe.id))[0];
    await R.act.POST(req("/x", { method: "POST", body: { action: "reject", ids: [cafe.id], matchIds: [rejectId.id] } }), p);
    await R.act.POST(req("/x", { method: "POST", body: { action: "suggest" } }), p);
    check("5. a rejected pair is not suggested again", !(await sug(cafe.id)).some((m) => m.billId === rejectId.billId) && (await sug(cafe.id)).length === 1, await sug(cafe.id));

    // --- 6. reimbursement
    const janaTx = await tx("Proplacení");
    const cand = await json(await R.pairing.GET(req(`/x?`), params({ id: eventId, txId: janaTx.id })));
    check("6. reimbursement: payer's unreimbursed bills pre-ticked", cand.body?.reimbursement?.author?.id === jana.id && cand.body.reimbursement.billIds.includes(bJana.id) && cand.body.suggestions.length === 0, cand.body?.reimbursement);
    const paired = await json(await R.pairing.POST(req("/x", { method: "POST", body: { billIds: [bJana.id] } }), params({ id: eventId, txId: janaTx.id })));
    const janaAfter = await prisma.bill.findUniqueOrThrow({ where: { id: bJana.id } });
    check("6. confirm sets Proplaceno at the payment date", paired.body?.markedPaid === 1 && janaAfter.paidToAuthor && janaAfter.paidAt?.toISOString().slice(0, 10) === "2026-07-07", { paired: paired.body, paidAt: janaAfter.paidAt });
    const m = await prisma.bankMatch.findFirstOrThrow({ where: { transactionId: janaTx.id, billId: bJana.id } });
    await R.matches.DELETE(req(`/x?clearPaid=1`, { method: "DELETE" }), params({ id: eventId, matchId: m.id }));
    check("6. unpairing with 'clear Proplaceno' takes it back", !(await prisma.bill.findUniqueOrThrow({ where: { id: bJana.id } })).paidToAuthor && !(await prisma.bankMatch.findUnique({ where: { id: m.id } })));

    // --- 7. bill from a payment
    await R.act.POST(req("/x", { method: "POST", body: { action: "reject", ids: [bied.id] } }), p);
    const made = await json(await R.act.POST(req("/x", { method: "POST", body: { action: "createBills", ids: [bied.id] } }), p));
    const newBill = await prisma.bill.findUniqueOrThrow({ where: { id: made.body?.billIds?.[0] }, include: { bankMatches: true } });
    check("7. Vytvořit doklad: bill without a file, chybí doklad, paired + confirmed", made.body?.created === 1 && newBill.gcsObjectPath === null && newBill.documentMissing && newBill.status === "to_review" && newBill.bankMatches.length === 1 && !!newBill.bankMatches[0].confirmedAt && Number(newBill.amountCzk) === 553, { made: made.body, newBill: { ...newBill, sizeBytes: undefined } });
    const { approveBill } = await import("@/lib/bill-actions");
    await prisma.billCategory.create({ data: { billId: newBill.id, eventCategoryId: cat.id, amount: new Prisma.Decimal(553), amountCzk: new Prisma.Decimal(553) } });
    const appr = await approveBill(newBill.id, banker.id);
    check("7. a bill without a file can be approved", appr.ok, appr);

    // --- 8. bills-only user: Platba column yes, counterparty no
    asUser(billsOnly);
    const list = await json(await R.bills.GET(req("/x"), p));
    const pay = await json(await R.payment.GET(req("/x"), params({ id: bAlbert.id })));
    check("8. bills-only user sees the Platba state", (list.body as { id: string; payment: { state: string } | null }[]).find((b) => b.id === bAlbert.id)?.payment?.state === "bank", list.status);
    check("8. bills-only user: no counterparty in the bill detail", pay.status === 200 && pay.body.matches.length === 1 && !("counterparty" in pay.body.matches[0]), pay.body);
    asUser(banker);
    const payB = await json(await R.payment.GET(req("/x"), params({ id: bAlbert.id })));
    check("8. a Banka user sees the counterparty", payB.body?.matches?.[0]?.counterparty === "ALBERT CR", payB.body?.matches);

    // --- 9. totals
    const all = await json(await R.txs.GET(req("/x?tab=all&group=classification"), p));
    const rows = all.body.rows as { amount: number }[];
    const inc = rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0), out = rows.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);
    const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
    check("9. footer totals = sum of the visible rows", near(all.body.totals.income, inc) && near(all.body.totals.expense, out) && all.body.totals.count === rows.length, { totals: all.body.totals, inc, out, n: rows.length });
    const g = all.body.groups as { income: number; expense: number; count: number }[];
    check("9. group subtotals add up to the total", near(g.reduce((s, x) => s + x.income, 0), inc) && near(g.reduce((s, x) => s + x.expense, 0), out) && g.reduce((s, x) => s + x.count, 0) === rows.length, g);
    const filtered = await json(await R.txs.GET(req("/x?tab=all&dir=out&min=40&max=100"), p));
    check("9. filters: outgoing 40–100 Kč = the two coffees + fee", (filtered.body.rows as { amount: number }[]).every((r) => r.amount <= -40 && r.amount >= -100) && filtered.body.rows.length === 3, filtered.body.rows.map((r: { amount: number }) => r.amount));
    // --- 2. Sheet re-sync: one row edited, one deleted (the same commit path the Sheet sync uses)
    const { commitImport } = await import("@/lib/bank/import");
    const { rowsToTransactions } = await import("@/lib/bank/parse");
    const sheetAcc = await prisma.bankAccount.create({ data: { organizationId: org.id, label: "Sheet", accountNumber: "777777", bankCode: "0300", sourceType: "sheet" } });
    const window = { from: "2026-07-01", to: "2026-07-14" };
    const mapping = ["date", "counterName", "message", "amount"];
    const sheetRows = [["02.07.2026", "Lidl", "a", "-100"], ["03.07.2026", "Penny", "b", "-200"], ["04.07.2026", "Tesco", "c", "-300"]];
    const parse = (rows: string[][]) => rowsToTransactions(rows, mapping, { firstLine: 2, currency: "CZK", idPrefix: "id:" });
    const sync = (rows: string[][]) => commitImport({ eventId, account: sheetAcc, source: "sheet", userId: banker.id, results: parse(rows), window, markMissing: true });
    await sync(sheetRows);
    const penny = await prisma.bankTransaction.findFirstOrThrow({ where: { bankAccountId: sheetAcc.id, counterpartyName: "Penny" } });
    // Penny gets paired; then the sheet loses Tesco and Penny's amount is edited.
    const pennyBill = await bill("PennyBill", 200, "2026-07-03");
    await R.pairing.POST(req("/x", { method: "POST", body: { billIds: [pennyBill.id] } }), params({ id: eventId, txId: penny.id }));
    const res = await sync([sheetRows[0], ["03.07.2026", "Penny", "b", "-210"]]);
    const sheetTx = await prisma.bankTransaction.findMany({ where: { bankAccountId: sheetAcc.id }, include: { matches: true } });
    const tesco = sheetTx.find((t) => t.counterpartyName === "Tesco");
    const pennyOld = sheetTx.find((t) => t.id === penny.id);
    check("2. Sheet: edited row = new, deleted row -> sourceMissing, paired row never removed", res.counts.new === 1 && sheetTx.length === 4 && !!tesco?.sourceMissing && !!pennyOld?.sourceMissing && pennyOld.matches.some((m) => m.confirmedAt) && sheetTx.filter((t) => !t.sourceMissing).length === 2, { counts: res.counts, rows: sheetTx.map((t) => [t.counterpartyName, Number(t.amount), t.sourceMissing, t.matches.length]) });

    const ov = await json(await R.overview.GET(req("/x"), p));
    check("Přehled loads, cash withdrawn 2 000", ov.status === 200 && near(ov.body.cash.withdrawn, 2000), ov.body?.cash);
  } catch (err) {
    // An exception mid-way is a failure, never a silent stop.
    check("no exception", false, String(err instanceof Error ? err.stack : err));
  } finally {
    asUser(null);
    const errors: string[] = [];
    const step = async (name: string, fn: () => Promise<unknown>) => fn().catch((e) => errors.push(`${name}: ${String(e).split("\n")[0]}`));
    if (eventId) {
      const ev = { eventId };
      await step("bankTransaction", () => prisma.bankTransaction.deleteMany({ where: ev }));
      await step("bankImportBatch", () => prisma.bankImportBatch.deleteMany({ where: ev }));
      await step("billCategory", () => prisma.billCategory.deleteMany({ where: { bill: ev } }));
      await step("billAuditLog", () => prisma.billAuditLog.deleteMany({ where: { bill: ev } }));
      await step("bill", () => prisma.bill.deleteMany({ where: ev }));
      await step("participant", () => prisma.participant.deleteMany({ where: ev }));
      await step("eventCategory", () => prisma.eventCategory.deleteMany({ where: ev }));
      await step("eventBankAccount", () => prisma.eventBankAccount.deleteMany({ where: ev }));
      await step("access", () => prisma.userEventModuleAccess.deleteMany({ where: ev }));
      await step("eventModule", () => prisma.eventModule.deleteMany({ where: ev }));
      await step("event", () => prisma.event.delete({ where: { id: eventId } }));
    }
    const ov = { organizationId: org.id };
    await step("bankAccount", () => prisma.bankAccount.deleteMany({ where: ov }));
    await step("author", () => prisma.author.deleteMany({ where: ov }));
    await step("merchantAlias", () => prisma.merchantAlias.deleteMany({ where: ov }));
    await step("user", () => prisma.user.deleteMany({ where: ov }));
    await step("organization", () => prisma.organization.delete({ where: { id: org.id } }));
    const left = await prisma.organization.count({ where: { name: ORG } });
    for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `\n      ${r.detail}` : ""}`);
    console.log(`\ncleanup: ${errors.length ? `ERRORS -- ${errors.join("; ")}` : "ok"}; "${ORG}" left: ${left}`);
    console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
    process.exit(results.every((r) => r.ok) && !errors.length ? 0 : 1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
