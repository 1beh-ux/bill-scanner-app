// Self-check for the Fio parser + pure matcher (docs/bank-payments-design.md Part 2):
// `npx tsx scripts/check-bank-matching.ts` -- fake Fio JSON in, expected decisions out.
import { parseFioStatement } from "@/lib/bank/fio-client";
import { matchMovements, type Candidate } from "@/lib/bank/bank-matching";

const col = (value: unknown) => ({ value, name: "x", id: 0 });
const tx = (id: number, amount: number, vs: string | null, currency = "CZK") => ({
  column22: col(id), column0: col("2026-10-01+0200"), column1: col(amount), column14: col(currency),
  column5: vs == null ? null : col(vs), column10: col("Novák"), column2: col("123456"), column3: col("0800"), column16: col("tábor"),
});
const statement = (txs: unknown[] | null) => ({ accountStatement: { info: {}, transactionList: { transaction: txs } } });

const cand = (id: string, acceptedVs: string | null, currentVs: string | null, expected = 1000, paid = false): Candidate => ({ participantId: id, acceptedVs, currentVs, expected, paid });
const base = [cand("ana", "261100001", "261100001"), cand("ben", "261100002", "261110002"), cand("cyr", null, "261100003", 1000, true), cand("dan", "261100004", "261100004"), cand("eva", "261100004", null)];

let failed = 0;
function check(name: string, txs: unknown[] | null, candidates: Candidate[], expected: string[]) {
  const got = matchMovements(parseFioStatement(statement(txs)), candidates).map((d) => `${d.status}/${d.reason ?? d.participantId}${d.status === "review" && d.participantId ? `:${d.participantId}` : ""}`);
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` -- got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`}`);
}

check("null transaction list", null, base, []);
check("outgoing payment ignored", [tx(1, -1000, "261100001")], base, []);
check("EUR -> review/not_czk", [tx(2, 1000, "261100001", "EUR")], base, ["review/not_czk"]);
check("no VS -> review/no_match", [tx(3, 1000, null)], base, ["review/no_match"]);
check("exact amount + VS -> settled", [tx(4, 1000, "261100001")], base, ["settled/ana"]);
check("leading zeros + spaces in VS", [tx(5, 1000, "00 261100001")], base, ["settled/ana"]);
check("old (accepted) VS", [tx(6, 1000, "261100002")], base, ["settled/ben"]);
check("new (current) VS", [tx(7, 1000, "261110002")], base, ["settled/ben"]);
check("more than 2x -> review/overpaid", [tx(8, 2001, "261100001")], base, ["review/overpaid:ana"]);
check("exactly 2x -> settled", [tx(9, 2000, "261100001")], base, ["settled/ana"]);
check("underpaid -> review/underpaid", [tx(10, 999, "261100001")], base, ["review/underpaid:ana"]);
check("two candidates -> review/ambiguous", [tx(11, 1000, "261100004")], base, ["review/ambiguous"]);
check("already paid -> review/duplicate", [tx(12, 1000, "261100003")], base, ["review/duplicate:cyr"]);
check("second payment in one batch -> duplicate", [tx(13, 1000, "261100001"), tx(14, 1000, "261100001")], base, ["settled/ana", "review/duplicate:ana"]);
check("same movement twice -> decided once", [tx(15, 1000, "261100001"), tx(15, 1000, "261100001")], base, ["settled/ana"]);
check("unknown VS -> review/no_match", [tx(16, 1000, "999")], base, ["review/no_match"]);

let threw = false;
try { parseFioStatement({ nope: 1 }); } catch { threw = true; }
console.log(`${threw ? "PASS" : "FAIL"} unparseable statement throws`);
if (!threw) failed++;

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
