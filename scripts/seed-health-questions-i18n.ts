// 2026-10-27: pill plan edit/duplicate, Léky a výdej settings + "záznam", bulk answers "next", Dotazy na rodiče. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("medPlansSection.edit", "Upravit", "Edit"),
  r("medPlansSection.editTitle", "Upravit plán", "Edit the plan"),
  r("medPlansSection.duplicate", "Stejný lék v jiný čas", "The same med at another time"),
  r("medGridPage.addNote", "záznam", "note"),
  r("medGridPage.addNoteHint", "Zapsat do zdravotního deníku, když se něco stane", "Write into the health log when something happens"),
  r("medsSettings.title", "Léky a výdej", "Meds and dispensing"),
  r("medsSettings.hint", "Jak stránka Léky a výdej vypadá: velikost písma tabulky, která tlačítka období nabízí a na kterém se otevře, a výchozí tisk.", "How the Meds and dispensing page looks: the table's font size, which period buttons it offers and which it opens on, and the print defaults."),
  r("medsSettings.fontSize", "Velikost písma", "Font size"),
  r("medsSettings.size.s", "Malé", "Small"),
  r("medsSettings.size.m", "Běžné", "Normal"),
  r("medsSettings.size.l", "Velké", "Large"),
  r("medsSettings.size.xl", "Největší", "Largest"),
  r("medsSettings.defaultPreset", "Otevřít na", "Open on"),
  r("medsSettings.presets", "Zobrazená tlačítka období", "Period buttons shown"),
  r("bulkAnswers.applyNext", "Upravit {n} odpovědí a další otázka", "Edit {n} answers and next question"),
  r("bulkAnswers.skip", "Další otázka", "Next question"),
  r("parentQuestions.title", "Dotazy na rodiče", "Questions for parents"),
  r("parentQuestions.openCount", "{n} otevřené", "{n} open"),
  r("parentQuestions.ask", "Zeptat se rodiče", "Ask the parent"),
  r("parentQuestions.none", "Zatím žádné dotazy.", "No questions yet."),
  r("parentQuestions.noneHere", "Tady nic není.", "Nothing here."),
  r("parentQuestions.question", "Otázka", "Question"),
  r("parentQuestions.questionPlaceholder", "Např. Vitamín ráno – hned po probuzení, k snídani, nebo po snídani?", "E.g. The vitamin in the morning – right after waking, at breakfast or after breakfast?"),
  r("parentQuestions.options", "Připravené odpovědi (nepovinné, každá na řádek)", "Prepared answers (optional, one per line)"),
  r("parentQuestions.optionsPlaceholder", "hned po probuzení\nk snídani\npo snídani", "right after waking\nat breakfast\nafter breakfast"),
  r("parentQuestions.optionsHint", "Ano a Ne se nabízejí vždy.", "Yes and No are always offered."),
  r("parentQuestions.add", "Uložit dotaz", "Save the question"),
  r("parentQuestions.answerPlaceholder", "Odpověď vlastními slovy", "The answer in your own words"),
  r("parentQuestions.change", "Změnit", "Change"),
  r("parentQuestions.clearAnswer", "Zrušit odpověď", "Clear the answer"),
  r("parentQuestions.confirmDelete", "Smazat tento dotaz?", "Delete this question?"),
  r("parentQuestions.pageHint", "Dotazy, které jste si zapsali u dětí. Když rodiče dítě přivedou, klikněte na připravenou odpověď (nebo Ano / Ne), nebo napište vlastní.", "The questions you noted for the children. When the parents bring the child, click a prepared answer (or Yes / No), or write your own."),
  r("parentQuestions.askFor", "Nový dotaz pro", "New question for"),
  r("parentQuestions.filter.open", "Otevřené", "Open"),
  r("parentQuestions.filter.answered", "Zodpovězené", "Answered"),
  r("parentQuestions.filter.all", "Všechny", "All"),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} health-questions keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
