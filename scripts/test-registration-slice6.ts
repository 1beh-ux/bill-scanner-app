// Self-check for registration slice 6 (no DB): permanent documents on the
// person -- the received rule, which files may become person documents,
// replacement / revoke order, and the "platí trvale" backfill selection.
// npx tsx scripts/test-registration-slice6.ts
import assert from "node:assert/strict";
import { backfillPicks, canBecomePersonDocument, countsAsReceived, currentPersonDoc, docState, profileDocRows, registrationState, type ReviewStatus } from "../src/lib/registration-status";

const day = (n: number) => new Date(Date.UTC(2026, 0, n));
const pdoc = (id: string, docKey: string, created: number, revoked: number | null = null) => ({ id, docKey, createdAt: day(created), revokedAt: revoked ? day(revoked) : null });
const types = [
  { id: "prihlaska", key: "PRIHLASKA", data: null },
  { id: "bezinf", key: "BEZINF", data: null },
  { id: "jen-akce", key: null, data: null },
];
const permanent = new Set(["PRIHLASKA"]);

// --- 4. counting as received ------------------------------------------------------
const rows = profileDocRows(types, permanent, [pdoc("a", "PRIHLASKA", 1)]);
assert.deepEqual(rows.map((r) => r.eventListItemId), ["prihlaska"], "permanent type with a current person document counts");
assert.equal(countsAsReceived(rows[0]), true, "a profile row counts as received");
assert.equal(docState(rows, "prihlaska").state, "received");
assert.equal(profileDocRows(types, new Set(), [pdoc("a", "PRIHLASKA", 1)]).length, 0, "unticked template: rows stay, nothing counts");
assert.equal(profileDocRows(types, new Set(["BEZINF"]), [pdoc("a", "PRIHLASKA", 1)]).length, 0, "other key");
assert.equal(profileDocRows([{ ...types[0], data: { requireNew: true } }], permanent, [pdoc("a", "PRIHLASKA", 1)]).length, 0, "vyžadovat nový: ignored in this event");
assert.equal(profileDocRows(types, permanent, [pdoc("a", "PRIHLASKA", 1, 2)]).length, 0, "revoked: missing again");
assert.equal(profileDocRows(types, permanent, []).length, 0, "unlinked participant (no person documents): unchanged");
assert.equal(profileDocRows([types[2]], permanent, [pdoc("a", "PRIHLASKA", 1)]).length, 0, "event-only type (no key) can't be permanent");

const base = { accepted: true, docTypeIds: ["prihlaska", "bezinf"], paymentDocTypeId: null, requiredEmpty: false, pendingProfileChange: false };
const own = [{ eventListItemId: "bezinf", receivedVia: "email", reviewStatus: null }];
assert.equal(registrationState({ ...base, docs: own }), "missing", "without the profile document");
assert.equal(registrationState({ ...base, docs: [...own, ...rows] }), "complete", "with it");

// --- 2. what may become a person document -----------------------------------------
const file = (receivedVia: string, gcsPath: string | null = "x.pdf", reviewStatus: ReviewStatus | null = null) => ({ receivedVia, gcsPath, reviewStatus });
assert.equal(canBecomePersonDocument(file("email")), true, "e-mailed attachment saved via Pošta");
assert.equal(canBecomePersonDocument(file("portal", "x.pdf", "approved")), true, "approved portal upload");
assert.equal(canBecomePersonDocument(file("manual")), true, "admin upload (manual with a file)");
assert.equal(canBecomePersonDocument(file("manual", null)), false, "a tick without a file never does");
assert.equal(canBecomePersonDocument(file("sheet", null)), false, "a sheet tick never does");
assert.equal(canBecomePersonDocument(file("generated")), false, "a generated document never does");
assert.equal(canBecomePersonDocument(file("portal", "x.pdf", "pending")), false, "upload in review");
assert.equal(canBecomePersonDocument(file("portal", "x.pdf", "rejected")), false, "rejected upload");

// --- 2, 5. replacement / revoke order ---------------------------------------------
const history = [pdoc("old", "PRIHLASKA", 1), pdoc("new", "PRIHLASKA", 5), pdoc("mid", "PRIHLASKA", 3), pdoc("other", "BEZINF", 9)];
assert.equal(currentPersonDoc(history, "PRIHLASKA")?.id, "new", "the newest replaces the current one");
assert.equal(currentPersonDoc([pdoc("old", "PRIHLASKA", 1), pdoc("new", "PRIHLASKA", 5, 6)], "PRIHLASKA")?.id, "old", "newest revoked alone -> the older one");
assert.equal(currentPersonDoc([pdoc("old", "PRIHLASKA", 1, 6), pdoc("new", "PRIHLASKA", 5, 6)], "PRIHLASKA"), null, "revoke takes the replaced ones too (route)");
assert.equal(profileDocRows(types, permanent, history)[0].doc.id, "new");

// --- 6. backfill selection ----------------------------------------------------------
const cand = (id: string, childId: string, received: number, receivedVia = "email", gcsPath: string | null = "x.pdf", reviewStatus: ReviewStatus | null = null) => ({ id, childId, receivedAt: day(received), receivedVia, gcsPath, reviewStatus });
const picks = backfillPicks(
  [
    cand("k1-old", "kid1", 1),
    cand("k1-new", "kid1", 4, "portal", "x.pdf", "approved"),
    cand("k1-review", "kid1", 9, "portal", "x.pdf", "pending"),
    cand("k1-gen", "kid1", 10, "generated"),
    cand("k1-tick", "kid1", 11, "manual", null),
    cand("k2", "kid2", 2),
    cand("k2-ticked-generated", "kid2", 8, "manual"),
    cand("k3", "kid3", 3),
    cand("k4-used", "kid4", 3),
  ],
  [
    { childId: "kid3", sourceParticipantDocumentId: null, revokedAt: null },
    { childId: "kid4", sourceParticipantDocumentId: "k4-used", revokedAt: day(5) },
  ]
);
assert.deepEqual(picks.map((p) => p.id).sort(), ["k1-new", "k2"], "newest real file per person; not in review / generated / ticks / ticked generated; not people already covered; a revoked source stays revoked");

console.log("registration slice 6 self-check: ok");
