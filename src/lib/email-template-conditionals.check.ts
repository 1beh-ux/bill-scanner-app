// Self-check: conditional blocks in e-mail templates (2026-11-27). npx tsx src/lib/email-template-conditionals.check.ts
import assert from "node:assert/strict";
import { substituteVariables } from "@/lib/email-template";
const t = "A\n{{#attachments_list}}V příloze: {{attachments_list}}.\n{{/attachments_list}}{{^attachments_list}}Registrační list už máme.\n{{/attachments_list}}B";
assert.equal(substituteVariables(t, { attachments_list: "Registrační list" }), "A\nV příloze: Registrační list.\nB");
assert.equal(substituteVariables(t, { attachments_list: "" }), "A\nRegistrační list už máme.\nB");
assert.equal(substituteVariables("{{#nic}}x{{/nic}}y", {}), "y");
assert.equal(substituteVariables("Ahoj {{name}}", { name: "Eva" }), "Ahoj Eva");
console.log("conditionals ok");
