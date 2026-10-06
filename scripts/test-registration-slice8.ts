// Self-check for registration slice 8 (no DB): portal "Přidat člena rodiny"
// validation, "Už nebude chodit" (registrability + link e-mails), selective
// linking (Event.peopleLinkMode). npx tsx scripts/test-registration-slice8.ts
import assert from "node:assert/strict";
import { config } from "dotenv";
config({ path: ".env" });

async function main() {
  const { memberFormFields, validateSubmission } = await import("../src/lib/public-registration");
  const { isActivePerson, leftData, linkRecipients } = await import("../src/lib/portal-rules");
  const { planLinks } = await import("../src/lib/children");

  // --- 1. add a family member -------------------------------------------------------
  const tpl = (key: string, o: Partial<{ portalAccess: string; level: string; requiredInRegistration: boolean; audience: "both" | "children" | "adults"; fieldType: string }> = {}) => ({
    key,
    label: key,
    fieldType: "text",
    options: null,
    portalAccess: "edit",
    level: "basic",
    requiredInRegistration: false,
    audience: "both" as const,
    ...o,
  });
  const fields = memberFormFields([
    tpl("pojistovna", { requiredInRegistration: true }),
    tpl("alergie", { audience: "children", requiredInRegistration: true }),
    tpl("ridicak", { audience: "adults", portalAccess: "approval" }),
    tpl("poznamka", { portalAccess: "read" }),
    tpl("tajne", { portalAccess: "hidden" }),
    tpl("krevni", { level: "detailed" }),
  ]);
  assert.deepEqual(fields.map((f) => f.key), ["pojistovna", "alergie", "ridicak"], "basic + edit/approval only");
  const ctx = { fields, rules: null, oddil: null, today: new Date("2026-10-06") };
  const child = { firstName: "Ema", lastName: "Nová", birthDate: "2018-05-01", isAdult: false, values: { pojistovna: "111", alergie: "pyl", ridicak: "B" } };
  const guardians = [{ name: "Jana Nová", email: "jana@example.cz", phone: null, relationship: null }];
  const ok = validateSubmission({ persons: [child], guardians }, ctx);
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.deepEqual(ok.data.persons[0].values, { pojistovna: "111", alergie: "pyl" }, "adults-only field dropped for a child");
    assert.equal(ok.data.persons[0].guardians[0].email, "jana@example.cz", "pre-filled guardians kept");
  }
  const missing = validateSubmission({ persons: [{ ...child, values: { pojistovna: "111" } }], guardians }, ctx);
  assert.ok(!missing.ok && missing.errors.includes("p0.alergie"), "children's required field required for a child");
  const adult = validateSubmission({ persons: [{ firstName: "Petr", lastName: "Nový", birthDate: "1985-01-01", isAdult: true, email: "petr@example.cz", values: { pojistovna: "211" } }] }, ctx);
  assert.ok(adult.ok, "children-only required field not asked of an adult");
  if (adult.ok) assert.equal(adult.data.persons[0].guardians[0].email, "petr@example.cz", "an adult's contact is their own");
  const noGuardian = validateSubmission({ persons: [child], guardians: [] }, ctx);
  assert.ok(!noGuardian.ok && noGuardian.errors.includes("guardians"), "a child needs a guardian");
  const noEmail = validateSubmission({ persons: [{ firstName: "Petr", lastName: "Nový", birthDate: "1985-01-01", isAdult: true, values: { pojistovna: "211" } }] }, ctx);
  assert.ok(!noEmail.ok && noEmail.errors.includes("p0.email"), "an adult needs an e-mail");
  const future = validateSubmission({ persons: [{ ...child, birthDate: "2027-01-01" }], guardians }, ctx);
  assert.ok(!future.ok && future.errors.includes("p0.birthDate"));

  // --- 2. leave / undo ---------------------------------------------------------------
  const left: { leftAt: Date | null; leftVia: string | null; leftNote: string | null } = leftData(true, "portal", "  stěhujeme se  ");
  assert.equal(left.leftVia, "portal");
  assert.equal(left.leftNote, "stěhujeme se");
  assert.ok(!isActivePerson(left), "left = not registrable (eligibilityFacts drops it)");
  assert.equal(leftData(true, "admin", "").leftNote, null, "empty note = none");
  const back = { ...left, ...leftData(false, "portal") };
  assert.ok(isActivePerson(back), "Obnovit = registrable again");
  assert.deepEqual([back.leftAt, back.leftVia, back.leftNote], [null, null, null], "undo clears everything");

  // invitation / link e-mail skip inactive
  const g = (email: string) => ({ email });
  assert.deepEqual(
    linkRecipients([
      { leftAt: null, guardians: [g("mama@x.cz"), g("tata@x.cz")] },
      { leftAt: new Date(), guardians: [g("MAMA@x.cz"), g("babicka@x.cz")] },
    ]),
    ["mama@x.cz", "tata@x.cz"],
    "only active members' guardians, each once"
  );
  assert.deepEqual(linkRecipients([{ leftAt: "2026-10-01", guardians: [g("a@x.cz")] }]), [], "all inactive = nobody");

  // --- 3. link mode ------------------------------------------------------------------
  const dob = new Date("2015-03-02");
  const kids = [{ id: "c1", name: "Jan Novák", dateOfBirth: dob, eventIds: [] as string[] }];
  const cand = (id: string, name: string, o: { createMissing?: boolean; unlinked?: boolean; eventId?: string } = {}) => ({ id, eventId: o.eventId ?? "e1", name, dateOfBirth: dob, ...o });
  assert.deepEqual(
    planLinks([cand("p1", "Jan Novák", { createMissing: false }), cand("p2", "Eva Malá", { createMissing: false })], kids),
    [{ childId: "c1", participantIds: ["p1"] }],
    "existing: links to an existing person, never creates"
  );
  assert.deepEqual(
    planLinks([cand("p1", "Jan Novák"), cand("p2", "Eva Malá")], kids),
    [
      { childId: "c1", participantIds: ["p1"] },
      { childId: null, participantIds: ["p2"] },
    ],
    "all (default): creates the missing person"
  );
  assert.deepEqual(planLinks([cand("p1", "Jan Novák", { unlinked: true }), cand("p2", "Eva Malá", { unlinked: true })], kids), [], "Odpojit od Lidé event: skipped");
  assert.deepEqual(
    planLinks([cand("p1", "Eva Malá", { createMissing: false, eventId: "e1" }), cand("p2", "Eva Malá", { eventId: "e2" })], kids),
    [{ childId: null, participantIds: ["p1", "p2"] }],
    "an 'all' event creates the person; the 'existing' one links to it"
  );

  console.log("slice 8 self-check: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
