// Self-check for the Vyúčtování message (src/lib/settlement-message.ts). npx tsx scripts/check-settlement-message.ts
import assert from "node:assert/strict";
import { DEFAULT_MESSAGES, fillMessage, messageCase, messagesOf } from "../src/lib/settlement-message";

const z = { official: 0, personalIn: 0, personalOut: 0, owedByPeople: 0, owesPeople: 0, net: 0 };
assert.equal(messageCase({ ...z, personalOut: 120 }), "owes");
assert.equal(messageCase({ ...z, owesPeople: 66 }), "owes", "only person to person");
assert.equal(messageCase({ ...z, official: 200 }), "owed");
assert.equal(messageCase({ ...z, official: 200, personalOut: 100, net: 100 }), "bothOwed", "paid 200, spent 100: we pay");
assert.equal(messageCase({ ...z, official: 100, personalOut: 300, net: -200 }), "bothOwes", "paid 100, spent 300: they pay");
assert.equal(messageCase({ ...z, personalIn: 50, net: 50, owesPeople: 80 }), "bothOwes", "a debt to a person tips it");
assert.equal(messageCase({ ...z, official: 100, personalOut: 100, net: 0 }), "bothOwed", "even: the confirming text");
assert.equal(messageCase(z), "owed", "nothing at all: the confirming text");

const v = { name: "Jana", event: "Podzimky", net: -120, owesPeople: 0, owedByPeople: 0, link: "https://x/y" };
assert.equal(fillMessage("{jmeno}: {akce} {castka} {odkaz}", v), "Jana: Podzimky 120 Kč https://x/y");
assert.equal(fillMessage("Ahoj {jmeno}", v), "Ahoj Jana https://x/y", "the link is always there");
assert.equal(fillMessage("{zaplatit}/{dostanes}", { ...v, net: 50, owesPeople: 66 }), "66 Kč/50 Kč https://x/y");
assert.equal(fillMessage("{castka}", { ...v, net: 1234.5 }), "1 234,5 Kč https://x/y".replace(" ", " "));
assert.deepEqual(messagesOf({ owes: "  ", owed: "Moje" }), { ...DEFAULT_MESSAGES, owed: "Moje" });
assert.deepEqual(messagesOf({ both: "Starý" }), { ...DEFAULT_MESSAGES, bothOwes: "Starý", bothOwed: "Starý" }, "the old single text");
console.log("settlement message ok");
