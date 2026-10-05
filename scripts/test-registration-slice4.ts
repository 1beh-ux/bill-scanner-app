// Self-check for registration slice 4 (no DB): registration status incl.
// payment + rejected upload, upload review counting, {{portal_link_line}}.
// npx tsx scripts/test-registration-slice4.ts
import assert from "node:assert/strict";
import { RECEIVED_WHERE, countsAsReceived, docState, registrationState, requiredEmpty, type ReviewStatus } from "../src/lib/registration-status";
import { portalLinkLine } from "../src/lib/portal-gate";

const doc = (eventListItemId: string, receivedVia: string, reviewStatus: ReviewStatus | null = null, reviewNote: string | null = null) => ({ eventListItemId, receivedVia, reviewStatus, reviewNote });

// --- 6. upload review counting ---------------------------------------------------
assert.equal(countsAsReceived(doc("a", "email")), true, "e-mailed: as before");
assert.equal(countsAsReceived(doc("a", "manual")), true);
assert.equal(countsAsReceived(doc("a", "sheet")), true);
assert.equal(countsAsReceived(doc("a", "generated")), false, "sent by us, not received");
assert.equal(countsAsReceived(doc("a", "portal", "pending")), false, "upload in review does not count");
assert.equal(countsAsReceived(doc("a", "portal", "rejected")), false, "rejected upload does not count");
assert.equal(countsAsReceived(doc("a", "portal", "approved")), true, "approved upload counts");
// The Prisma filter says the same (OR, so null review status isn't dropped).
assert.deepEqual(RECEIVED_WHERE, { receivedVia: { not: "generated" }, OR: [{ reviewStatus: null }, { reviewStatus: "approved" }] });

assert.deepEqual(docState([doc("a", "portal", "rejected", "nečitelné")], "a"), { state: "rejected", note: "nečitelné" });
assert.equal(docState([doc("a", "portal", "rejected", "x"), doc("a", "portal", "pending")], "a").state, "pending", "re-upload after a rejection waits");
assert.equal(docState([doc("a", "portal", "pending"), doc("a", "manual")], "a").state, "received", "received wins");
assert.equal(docState([doc("a", "generated")], "a").state, "none");
assert.equal(docState([doc("b", "email")], "a").state, "none", "other type");

// --- 3. registration status -------------------------------------------------------
const base = { accepted: true, docTypeIds: ["a", "b"], paymentDocTypeId: null as string | null, docs: [doc("a", "email"), doc("b", "manual")], requiredEmpty: false, pendingProfileChange: false };
assert.equal(registrationState(base), "complete");
assert.equal(registrationState({ ...base, accepted: false }), "waiting", "pending registration");
assert.equal(registrationState({ ...base, pendingProfileChange: true }), "waiting", "pending profile change");
assert.equal(registrationState({ ...base, requiredEmpty: true }), "missing", "required field empty");
assert.equal(registrationState({ ...base, docs: [doc("a", "email")] }), "missing", "a document type with nothing");
assert.equal(registrationState({ ...base, docs: [doc("a", "email"), doc("b", "generated")] }), "missing", "generated doesn't count");
assert.equal(registrationState({ ...base, docs: [doc("a", "email"), doc("b", "portal", "rejected", "x")] }), "missing", "rejected upload");
assert.equal(registrationState({ ...base, docs: [doc("a", "email"), doc("b", "portal", "pending")] }), "waiting", "upload in review = waiting, not missing");
assert.equal(registrationState({ ...base, docs: [doc("a", "email"), doc("b", "portal", "approved")] }), "complete", "approved upload");
assert.equal(registrationState({ ...base, accepted: false, requiredEmpty: true }), "missing", "missing beats waiting");
assert.equal(registrationState({ ...base, docTypeIds: [], docs: [] }), "complete", "no document types (unconnected camp)");

// Payment document (5): only for an accepted registration; not a normal document.
const pay = { ...base, docTypeIds: ["a", "b", "pay"], paymentDocTypeId: "pay" };
assert.equal(registrationState(pay), "missing", "accepted, not paid");
assert.equal(registrationState({ ...pay, docs: [...base.docs, doc("pay", "sheet")] }), "complete", "paid (sheet sync)");
assert.equal(registrationState({ ...pay, docs: [...base.docs, doc("pay", "generated")] }), "missing", "generated payment doc isn't a payment");
assert.equal(registrationState({ ...pay, accepted: false }), "waiting", "pending registration: payment not asked yet");

assert.equal(requiredEmpty(["pojistovna"], { pojistovna: " " }), true);
assert.equal(requiredEmpty(["pojistovna"], { pojistovna: "111" }), false);
assert.equal(requiredEmpty([], {}), false);

// --- 11. {{portal_link_line}} --------------------------------------------------------
assert.equal(portalLinkLine(null), "", "no link: the line vanishes");
assert.match(portalLinkLine("https://x.cz/p/abc"), /^Vaše přihlášky, dokumenty a platby najdete v rodinném portálu: https:\/\/x\.cz\/p\/abc \(při prvním otevření se zeptá na datum narození\)\.$/);

async function portalLinkVariables() {
  process.env.APP_BASE_URL = "https://app.example.cz";
  const { portalLinkVars, usesPortalLink } = await import("../src/lib/document-variables");
  const empty = { portal_link: "", portal_link_line: "" };
  // These return before any DB access.
  assert.deepEqual(await portalLinkVars({ childId: "c1" }, { registrationConnected: false, kind: "event" }, true), empty, "unconnected event: empty");
  assert.deepEqual(await portalLinkVars({ childId: null }, { registrationConnected: true, kind: "event" }, true), empty, "not linked to a person: empty");
  delete process.env.APP_BASE_URL;
  assert.deepEqual(await portalLinkVars({ childId: "c1" }, { kind: "membership" }, true), empty, "no base URL: empty");
  assert.equal(usesPortalLink("Ahoj", "{{portal_link_line}}"), true);
  assert.equal(usesPortalLink("Ahoj {{camp_name}}"), false);
}

portalLinkVariables()
  .then(() => console.log("ok"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
