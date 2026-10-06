// Self-check for registration slice 7 (no DB): bulk import of permanent
// documents from Drive -- matching file names to people, and folder link/id parsing.
// npx tsx scripts/test-registration-slice7.ts
import assert from "node:assert/strict";
import { fileNameTokens, matchPeople, type MatchPerson } from "../src/lib/doc-import-match";
import { parseFolderId } from "../src/lib/drive-errors";

const person = (id: string, firstName: string | null, lastName: string | null, name = `${firstName ?? ""} ${lastName ?? ""}`.trim()): MatchPerson => ({ id, name, firstName, lastName });
const people = [
  person("jan", "Jan", "Novák"),
  person("jana", "Jana", "Nováková"),
  person("ríša", "Řehoř", "Šťastný"),
  person("anna-marie", "Anna Marie", "Dvořáková"),
  person("jen-jmeno", null, null, "Petr Svoboda"),
  person("jedno", "Kuba", null, "Kuba"),
];

// --- tokens ------------------------------------------------------------------------
assert.deepEqual(fileNameTokens("Přihláška_do_oddílu-Jan NOVÁK (2).pdf"), ["jan", "novak"], "noise words, digits, extension, diacritics, case");
assert.deepEqual(fileNameTokens("scan_0042.pdf"), [], "nothing but noise");

// --- matching ----------------------------------------------------------------------
assert.deepEqual(matchPeople("prihlaska_novak_jan.pdf", people), ["jan"], "any order");
assert.deepEqual(matchPeople("Přihláška - Jan Novák.PDF", people), ["jan"], "diacritics + case + spaces");
assert.deepEqual(matchPeople("jan.novak.scan.jpg", people), ["jan"], "dots as separators");
assert.deepEqual(matchPeople("IMG_20250912_Jana-Novakova.png", people), ["jana"], "Jana Nováková is not Jan Novák (whole words)");
assert.deepEqual(matchPeople("rehor_stastny.pdf", people), ["ríša"], "ř, š, ť without diacritics");
assert.deepEqual(matchPeople("dvorakova anna marie.pdf", people), ["anna-marie"], "two-word first name");
assert.deepEqual(matchPeople("anna dvorakova.pdf", people), [], "every name word must be there");
assert.deepEqual(matchPeople("svoboda petr.pdf", people), ["jen-jmeno"], "no first/last split: the full name's words");
assert.deepEqual(matchPeople("kuba.pdf", people), [], "one name word never matches");
assert.deepEqual(matchPeople("scan_0042.pdf", people), [], "no name: unmatched");
assert.deepEqual(matchPeople("novak.pdf", people), [], "last name only: unmatched");

const twins = [...people, person("jan2", "Jan", "Novák")];
assert.deepEqual(matchPeople("jan_novak.pdf", twins), ["jan", "jan2"], "two people with the same name: both offered");
assert.deepEqual(matchPeople("jan_novak.pdf", twins, new Set(["jan2"])), ["jan2", "jan"], "the event's participant first, the other not hidden");

// --- folder link / id --------------------------------------------------------------
const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz_-012";
assert.equal(parseFolderId(id), id, "bare id");
assert.equal(parseFolderId(`https://drive.google.com/drive/folders/${id}?usp=sharing`), id, "folder link");
assert.equal(parseFolderId(`https://drive.google.com/drive/u/1/folders/${id}`), id, "folder link with account");
assert.equal(parseFolderId(`https://drive.google.com/open?id=${id}`), id, "open?id= link");
assert.equal(parseFolderId("  "), null);
assert.equal(parseFolderId("not a folder"), null);

console.log("registration slice 7 self-check: ok");
