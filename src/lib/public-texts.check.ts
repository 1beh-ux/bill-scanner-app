// Self-check: npx tsx src/lib/public-texts.check.ts
import assert from "node:assert/strict";
import { readPublicTexts, withPublicTexts } from "@/lib/public-texts";

assert.deepEqual(readPublicTexts({ "public.doneTitle": " Díky! ", "portal.x": "", "nav.children": "Členové", "public.bad key": "x" }), { "public.doneTitle": "Díky!" });
assert.deepEqual(readPublicTexts(["x"]), {});
const base = { "public.doneTitle": "Děkujeme", "portal.save": "Uložit", "ticketForm.total": "Celkem" };
const page = withPublicTexts(base, { "public.doneTitle": "Org", "portal.save": "Org uložit" }, { "public.doneTitle": "Akce", "portal.unknown": "x" });
assert.equal(page["public.doneTitle"], "Akce"); // the event wins
assert.equal(page["portal.save"], "Org uložit"); // the organization's where the event has none
assert.equal(page["ticketForm.total"], "Celkem"); // other texts untouched
assert.equal("portal.unknown" in page, false); // no keys the page doesn't have
console.log("public texts ok");
