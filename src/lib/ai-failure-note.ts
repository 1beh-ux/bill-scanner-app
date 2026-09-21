// What is stored in a FAILED bill's user-visible note. The AI service's own text
// (English, model-written, e.g. "The provided image is blank...") is never copied
// there: it is logged server-side by the caller and kept in Bill.aiRawResponse.
// The note is a fixed, human Czech message (the app's working language); a blank /
// empty file gets its own, clearer wording.
export function humanAiFailureNote(rawNote: string | null | undefined): string {
  if (rawNote && /\b(blank|empty|no content|nothing (visible|to read)|unreadable)\b/i.test(rawNote)) {
    return "Soubor vypadá jako prázdná nebo nečitelná stránka, údaje se nepodařilo vyčíst. Zkontrolujte soubor a údaje případně vyplňte ručně.";
  }
  return "Údaje z účtenky se nepodařilo automaticky vyčíst. Zkontrolujte soubor a údaje vyplňte ručně.";
}
