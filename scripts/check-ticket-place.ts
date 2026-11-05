// TK2 (audit2): no "( , )" or dangling "·" when the event has no place. npx tsx scripts/check-ticket-place.ts
import assert from "node:assert/strict";
import { substituteVariables } from "../src/lib/email-template";

const t = "na {{event_name}} ({{event_date}}, {{event_place}}).\\n{{event_name}}, {{event_date}}, {{event_place}}\\n**{{event_date}}** · {{event_place}}";
assert.equal(substituteVariables(t, { event_name: "Ples", event_date: "15. 3. 2027", event_place: "" }), "na Ples (15. 3. 2027).\\nPles, 15. 3. 2027\\n**15. 3. 2027**");
assert.equal(substituteVariables(t, { event_name: "Ples", event_date: "15. 3. 2027", event_place: "Sokolovna" }), "na Ples (15. 3. 2027, Sokolovna).\\nPles, 15. 3. 2027, Sokolovna\\n**15. 3. 2027** · Sokolovna");
// Templates without the variable at all are untouched.
assert.equal(substituteVariables("Dobrý den, {{name}}", { name: "Jano", event_place: "" }), "Dobrý den, Jano");
console.log("check-ticket-place: all passed");
