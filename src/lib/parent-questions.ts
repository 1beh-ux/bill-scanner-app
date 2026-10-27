// "Dotazy na rodiče" (2026-10-27): questions noted before the event, answered when the parents bring the
// child -- free text or one click on a predefined answer (Ano / Ne always offered). Pure helpers.
export const QUESTION_MAX = 1000;
export const ANSWER_MAX = 2000;
export const QUICK_ANSWERS = ["Ano", "Ne"];

/** Untrusted predefined answers -> trimmed, unique, at most 10 (Ano / Ne need not be listed). */
export function readOptions(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/\n|;/) : [];
  return [...new Set(list.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 200)).filter(Boolean))].slice(0, 10);
}

/** The buttons to answer with: the question's own answers, then Ano / Ne unless already among them. */
export const answerButtons = (options: string[]) => [...options, ...QUICK_ANSWERS.filter((q) => !options.some((o) => o.toLowerCase() === q.toLowerCase()))];
