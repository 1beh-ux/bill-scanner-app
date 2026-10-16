// Self-check for src/lib/bank/classify.ts: npx tsx scripts/check-bank-classify.ts
import assert from "node:assert/strict";
import { accountKey, classify } from "../src/lib/bank/classify";

const ctx = { ownAccounts: new Set([accountKey("2400222222", "2010")!]), participantVs: new Set(["12345"]) };
const tx = (o: Partial<Parameters<typeof classify>[0]>) => ({ amount: -100, counterpartyAccount: null, counterpartyBankCode: null, vs: null, message: null, note: null, bankType: null, ...o });
assert.equal(accountKey("000019-0002400222", "2010"), "19-2400222/2010");
assert.equal(classify(tx({ counterpartyAccount: "0002400222222", counterpartyBankCode: "2010", amount: 5000 }), ctx).classification, "transfer");
assert.equal(classify(tx({ bankType: "Výběr z bankomatu" }), ctx).classification, "cash");
assert.equal(classify(tx({ bankType: "Platba kartou", message: "Výběr Praha" }), ctx).classification, "cash");
assert.equal(classify(tx({ bankType: "Poplatek - platební karta" }), ctx).classification, "fee");
assert.equal(classify(tx({ message: "Poplatek za vedení účtu" }), ctx).classification, "fee");
assert.deepEqual(classify(tx({ amount: 3500, vs: "12345" }), ctx), { classification: "income", incomeType: "fee", noDocumentNeeded: true });
assert.deepEqual(classify(tx({ amount: 200 }), ctx), { classification: "income", incomeType: "other", noDocumentNeeded: true });
assert.deepEqual(classify(tx({ bankType: "Platba kartou", message: "Albert" }), ctx), { classification: "expense", incomeType: null, noDocumentNeeded: false });
console.log("check-bank-classify: all passed");
