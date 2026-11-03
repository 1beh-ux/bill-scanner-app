// Self-check for the Vyúčtování message (src/lib/settlement-message.ts). npx tsx scripts/check-settlement-message.ts
import assert from "node:assert/strict";
import { DEFAULT_MESSAGES, fillMessage, messageCase, messagesOf } from "../src/lib/settlement-message";

const z = { official: 0, personalIn: 0, personalOut: 0, owedByPeople: 0, owesPeople: 0 };
assert.equal(messageCase({ ...z, personalOut: 120 }), "owes");
assert.equal(messageCase({ ...z, owesPeople: 66 }), "owes", "only person to person");
assert.equal(messageCase({ ...z, official: 200 }), "owed");
assert.equal(messageCase({ ...z, official: 200, personalOut: 100 }), "both");
assert.equal(messageCase({ ...z, personalIn: 50, owesPeople: 10 }), "both");
assert.equal(messageCase(z), "owed", "nothing at all: the confirming text");

const v = { name: "Jana", event: "Podzimky", net: -120, owesPeople: 0, owedByPeople: 0, link: "https://x/y" };
assert.equal(fillMessage("{jmeno}: {akce} {castka} {odkaz}", v), "Jana: Podzimky 120 Kč https://x/y");
assert.equal(fillMessage("Ahoj {jmeno}", v), "Ahoj Jana https://x/y", "the link is always there");
assert.equal(fillMessage("{zaplatit}/{dostanes}", { ...v, net: 50, owesPeople: 66 }), "66 Kč/50 Kč https://x/y");
assert.equal(fillMessage("{castka}", { ...v, net: 1234.5 }), "1 234,5 Kč https://x/y".replace(" ", " "));
assert.deepEqual(messagesOf({ owes: "  ", owed: "Moje" }), { ...DEFAULT_MESSAGES, owed: "Moje" });
console.log("settlement message ok");
