// E-mail template text variants (2026-11-27): the whole text in two versions by a condition -- "has document X /
// doesn't", "adult / child". Stored in the template body as conditional blocks (email-template.ts substituteVariables:
// {{#cond}}…{{/cond}}{{^cond}}…{{/cond}}) so the send and the preview need nothing new; the editor shows two tabs.
// Pure (the editor uses it).
export const ADULT_CONDITION = "je_dospely";
export const docConditionKey = (docTypeId: string) => `has_doc_${docTypeId.replace(/[^a-zA-Z0-9]/g, "")}`;

export type Variants = { cond: string; yes: string; no: string };

/** The body as two variants, when it is exactly {{#c}}yes{{/c}}{{^c}}no{{/c}}; else null (one text). */
export function readVariants(body: string): Variants | null {
  const m = body.match(/^\{\{#([a-zA-Z0-9_]+)\}\}\n?([\s\S]*?)\n?\{\{\/\1\}\}\n?\{\{\^\1\}\}\n?([\s\S]*?)\n?\{\{\/\1\}\}\s*$/);
  return m && (m[1] === ADULT_CONDITION || m[1].startsWith("has_doc_")) ? { cond: m[1], yes: m[2], no: m[3] } : null;
}

/** Two variants -> the stored body. */
export const writeVariants = (v: Variants) => `{{#${v.cond}}}\n${v.yes}\n{{/${v.cond}}}\n{{^${v.cond}}}\n${v.no}\n{{/${v.cond}}}\n`;
