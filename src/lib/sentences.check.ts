// Self-check for the sentence variables: `npx tsx src/lib/sentences.check.ts`
import assert from "node:assert/strict";
import { applySentences, sentenceValues } from "@/lib/sentences";

const text = { questionnaire_url: "https://q", questionnaire_line: "old", registration_deadline: "", registration_deadline_line: "", portal_link: "", portal_link_line: "", details_link: "https://d", details_link_line: "old d" };
const out = applySentences(text, { questionnaire_line: "Dotazník: {value}!", registration_deadline_line: "Do {value}.", details_link_line_page: "Stránka {value}", details_link_line_portal: "Portál {value}" }, sentenceValues(text));
assert.equal(out.questionnaire_line, "Dotazník: https://q!");
assert.equal(out.registration_deadline_line, ""); // no deadline -> no sentence, as today
assert.equal(out.details_link_line, "Stránka https://d"); // not in the portal -> the page version
assert.equal(out.portal_link_line, undefined); // no own wording -> untouched
assert.equal(applySentences({ ...text, portal_link: "https://p" }, { details_link_line_portal: "Portál {value}" }, sentenceValues({ ...text, portal_link: "https://p" })).details_link_line, "Portál https://d");
console.log("sentences ok");
export {};
