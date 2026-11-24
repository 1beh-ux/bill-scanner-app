// Self-check for ticket form fields: `npx tsx src/lib/ticket-fields.check.ts`
import assert from "node:assert/strict";
import { cleanTicketAnswers, ticketFieldVars, type TicketField } from "@/lib/ticket-fields";

const fields: TicketField[] = [
  { key: "stul", label: "Stůl", fieldType: "select", options: ["A", "B"], required: true },
  { key: "jidlo", label: "Jídlo", fieldType: "multi", options: ["maso", "vege"], required: false },
  { key: "foto", label: "Souhlas s focením", fieldType: "consent", options: null, required: true },
  { key: "pozn", label: "Poznámka k místu", fieldType: "text", options: null, required: false },
];
assert.deepEqual(cleanTicketAnswers(fields, { stul: "A", jidlo: "maso\nvege", foto: "true", extra: "x" }), { values: { stul: "A", jidlo: "maso\nvege", foto: "true" }, errors: [] });
assert.deepEqual(cleanTicketAnswers(fields, { stul: "C", foto: "false" }).errors, ["f.stul", "f.foto"]); // unknown option; consent not given
assert.deepEqual(cleanTicketAnswers(fields, null).errors, ["f.stul", "f.foto"]); // required missing
assert.deepEqual(ticketFieldVars(fields, { stul: "A", jidlo: "maso\nvege", foto: "true" }), { stul: "A", jidlo: "maso, vege", foto: "Ano", pozn: "" });
console.log("ticket-fields ok");
export {};
