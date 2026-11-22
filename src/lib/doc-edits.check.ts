// Self-check for Google Docs template edits (invented Docs JSON): `npx tsx src/lib/doc-edits.check.ts`
import assert from "node:assert/strict";
import type { docs_v1 } from "googleapis";
import { brokenPlaceholders, buildRequests, docParagraphs, findPlaceholders, readEdit, textOccurrences } from "@/lib/doc-edits";

// A paragraph as Google returns it: text runs with indexes (a placeholder split by bold formatting = two runs).
const para = (start: number, ...runs: string[]): docs_v1.Schema$StructuralElement => {
  let i = start;
  return { paragraph: { elements: runs.map((content) => ({ startIndex: i, endIndex: (i += content.length), textRun: { content } })) } };
};
const doc: docs_v1.Schema$Document = {
  revisionId: "r1",
  tabs: [
    {
      tabProperties: { tabId: "t.0" },
      documentTab: {
        body: {
          content: [
            para(1, "Milí rodiče {{zast_", "jmeno}},\n"), // split by formatting -> still one placeholder
            para(32, "tábor v místě Testov začíná {{date_range}}. Testov!\n"),
            { table: { tableRows: [{ tableCells: [{ content: [para(90, "{{ alergie }}\n")] }] }] } },
            para(110, "Podpis {{leader\n"), // broken across paragraphs
            para(126, "_name}}\n"),
          ],
        },
        headers: { "h.1": { content: [para(0, "{{zast_jmeno}} – hlavička\n")] } },
      },
    },
  ],
};
const paras = docParagraphs(doc);
assert.equal(paras.length, 6);
const ph = findPlaceholders(paras);
assert.deepEqual(ph.map((p) => [p.key, p.hasSpaces, p.where]), [["zast_jmeno", false, "body"], ["date_range", false, "body"], ["alergie", true, "body"], ["zast_jmeno", false, "header"]]);
assert.equal(ph[0].start, 13); // exact position across runs
assert.deepEqual(brokenPlaceholders(paras), ["{{leader", "_name}}"]);
assert.deepEqual(textOccurrences(paras, "Testov").map((o) => o.start), [46, 76]); // not inside a placeholder

const { requests, missing } = buildRequests(
  [
    { type: "rename", from: "zast_jmeno", to: "guardian1_name" },
    { type: "rename", from: "alergie", to: "alergie" }, // only the spaces
    { type: "typed", text: "Testov", key: "place" },
    { type: "rename", from: "nothing_here", to: "x" },
  ],
  paras,
);
assert.deepEqual(missing, [3]);
// Ranged edits first, last position first; then replaceAllText.
assert.deepEqual(requests.map((r) => Object.keys(r)[0]), ["deleteContentRange", "insertText", "deleteContentRange", "insertText", "replaceAllText", "replaceAllText"]);
assert.equal(requests[0].deleteContentRange?.range?.startIndex, 76);
assert.equal(requests[0].deleteContentRange?.range?.tabId, "t.0");
assert.equal(requests[1].insertText?.text, "{{place}}");
assert.deepEqual(requests[4].replaceAllText, { containsText: { text: "{{zast_jmeno}}", matchCase: true }, replaceText: "{{guardian1_name}}" });
assert.equal(requests[5].replaceAllText?.containsText?.text, "{{ alergie }}");
// Overlapping typed edits: the first wins.
assert.equal(buildRequests([{ type: "typed", text: "Testov", key: "place" }, { type: "typed", text: "Testov začíná", key: "x" }], paras).missing[0], 1);

assert.equal(readEdit({ type: "rename", from: "a", to: "1bad" }), null);
assert.deepEqual(readEdit({ type: "typed", text: "Testov", key: "place" }), { type: "typed", text: "Testov", key: "place" });
console.log("doc-edits ok");
export {};
