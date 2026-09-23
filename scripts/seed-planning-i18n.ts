// Planning Helper module translations (nav, access grid, lists, activity library).
// Idempotent upsert -- extend and re-run as later build steps add keys.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    // Foundation
    { key: "nav.planning", cs: "Plánování", en: "Planning" },
    { key: "nav.sectionPlanning", cs: "Plánování", en: "Planning" },
    { key: "accessTab.modulePlanning", cs: "Plánování", en: "Planning" },
    { key: "eventSettings.tabPlanning", cs: "Plánování", en: "Planning" },

    // Lists (categories, locations, leaders, day templates, base library)
    { key: "planLists.categoriesLabel", cs: "Kategorie programu", en: "Program categories" },
    { key: "planLists.locationsLabel", cs: "Místa", en: "Locations" },
    { key: "planLists.leadersLabel", cs: "Vedoucí aktivit", en: "Activity leaders" },
    { key: "planLists.dayTemplatesLabel", cs: "Šablony dnů", en: "Day templates" },
    { key: "planLists.baseLibraryLabel", cs: "Základní knihovna aktivit", en: "Base activity library" },
    {
      key: "planLists.templatesSubtitle",
      cs: "Výchozí seznamy pro nové akce. Aktivity ze základní knihovny se do akce přidávají v knihovně aktivit nebo přetažením na plán.",
      en: "Defaults for new events. Base-library activities are added to an event from its activity library or by dragging onto the plan.",
    },
    { key: "planLists.categoryGroup", cs: "Skupina", en: "Group" },
    { key: "planLists.groupPrimary", cs: "Hlavní", en: "Primary" },
    { key: "planLists.groupSecondary", cs: "Vedlejší", en: "Secondary" },
    { key: "planLists.color", cs: "Barva", en: "Color" },
    { key: "planLists.targetPercent", cs: "Cíl (% programu)", en: "Target (% of program)" },
    { key: "planLists.capacity", cs: "Kapacita", en: "Capacity" },
    { key: "planLists.notes", cs: "Poznámka", en: "Notes" },
    { key: "planLists.role", cs: "Role", en: "Role" },
    { key: "planLists.phone", cs: "Telefon", en: "Phone" },
    { key: "planLists.windowsLabel", cs: "Časová okna dne", en: "Time windows of the day" },
    { key: "planLists.addWindow", cs: "+ Přidat okno", en: "+ Add window" },
    { key: "planLists.windowKind.flexible", cs: "Program (hlídat kapacitu)", en: "Program (capacity checked)" },
    { key: "planLists.windowKind.partial", cs: "Program (volný)", en: "Program (loose)" },
    { key: "planLists.windowKind.fixed", cs: "Pevný blok", en: "Fixed block" },
    { key: "planLists.durationMin", cs: "Délka (min)", en: "Duration (min)" },
    { key: "planLists.primaryCategory", cs: "Hlavní kategorie", en: "Primary category" },
    { key: "planLists.secondaryCategory", cs: "Vedlejší kategorie", en: "Secondary category" },
    { key: "planLists.description", cs: "Popis", en: "Description" },
    { key: "planLists.energyLevel", cs: "Náročnost", en: "Energy" },
    { key: "planLists.energy.low", cs: "Nízká", en: "Low" },
    { key: "planLists.energy.medium", cs: "Střední", en: "Medium" },
    { key: "planLists.energy.high", cs: "Vysoká", en: "High" },
    { key: "planLists.repeatable", cs: "Lze zařadit opakovaně", en: "Can be scheduled repeatedly" },

    // Event activity library
    { key: "planActivities.title", cs: "Knihovna aktivit", en: "Activity library" },
    { key: "planActivities.add", cs: "Nová aktivita", en: "New activity" },
    { key: "planActivities.empty", cs: "Knihovna je prázdná. Přidejte aktivitu nebo ji naplňte ze základní knihovny.", en: "The library is empty. Add an activity or fill it from the base library." },
    { key: "planActivities.defaultLeader", cs: "Výchozí vedoucí", en: "Default leader" },
    { key: "planActivities.defaultLocation", cs: "Výchozí místo", en: "Default location" },
    { key: "planActivities.importBase", cs: "Přidat ze základní knihovny", en: "Add from base library" },
    { key: "planActivities.copyFromEventPlaceholder", cs: "Jiná akce…", en: "Another event…" },
    { key: "planActivities.copyFromEvent", cs: "Kopírovat z akce", en: "Copy from event" },
    { key: "planActivities.importAdded", cs: "Přidáno aktivit: {count}", en: "Activities added: {count}" },
    { key: "planActivities.importNothing", cs: "Nic nového k přidání.", en: "Nothing new to add." },
    { key: "planActivities.errorImportFailed", cs: "Import se nepodařil.", en: "Import failed." },
    { key: "planActivities.errorSaveFailed", cs: "Uložení se nepodařilo.", en: "Save failed." },
    { key: "planActivities.confirmDelete", cs: 'Opravdu smazat aktivitu "{name}"? Naplánované bloky zůstanou.', en: 'Really delete activity "{name}"? Scheduled blocks are kept.' },

    // Board (step 4-5)
    { key: "planBoard.addDay", cs: "den", en: "day" },
    { key: "planBoard.addDayPrevious", cs: "Kopie předchozího dne (jen okna)", en: "Copy of previous day (windows only)" },
    { key: "planBoard.addDayFromTemplate", cs: "Ze šablony: {name}", en: "From template: {name}" },
    { key: "planBoard.addDayEmpty", cs: "Prázdný den", en: "Empty day" },
    { key: "planBoard.editDay", cs: "Upravit den (název, datum, časová okna)", en: "Edit day (name, date, time windows)" },
    { key: "planBoard.deleteDay", cs: "Smazat den", en: "Delete day" },
    { key: "planBoard.confirmDeleteDay", cs: 'Smazat den "{day}" včetně všech naplánovaných aktivit?', en: 'Delete day "{day}" including all scheduled activities?' },
    { key: "planBoard.date", cs: "Datum", en: "Date" },
    { key: "planBoard.saveAsTemplate", cs: "Uložit okna jako šablonu dne", en: "Save windows as a day template" },
    { key: "planBoard.templateNamePlaceholder", cs: "Název šablony, např. Výletní den", en: "Template name, e.g. Trip day" },
    { key: "planBoard.templateSaved", cs: 'Šablona "{name}" uložena.', en: 'Template "{name}" saved.' },
    { key: "planBoard.confirmDropWindows", cs: "Okna {windows} obsahují naplánované aktivity, které se smažou. Pokračovat?", en: "Windows {windows} contain scheduled activities that will be deleted. Continue?" },
    { key: "planBoard.errorWindowTimes", cs: "Konec okna musí být po jeho začátku.", en: "A window must end after it starts." },
    { key: "planBoard.noDays", cs: "Zatím žádné dny. Přidejte první den tlačítkem + den.", en: "No days yet. Add the first one with + day." },
    { key: "planBoard.noTemplatesHint", cs: "Tip: šablony dnů (časová okna) nastavíte v Nastavení akce → Plánování.", en: "Tip: set up day templates (time windows) in Event settings → Planning." },
    { key: "planBoard.noWindows", cs: "Tento den nemá časová okna. Klikněte na záložku dne a přidejte je.", en: "This day has no time windows. Click the day tab to add them." },
    { key: "planBoard.usage", cs: "{used} / {capacity} min", en: "{used} / {capacity} min" },
    { key: "planBoard.overflow", cs: "{used} / {capacity} min — přečerpáno o {over} min", en: "{used} / {capacity} min — over by {over} min" },
    { key: "planBoard.usagePartial", cs: "{used} min naplánováno", en: "{used} min planned" },
    { key: "planBoard.dropHere", cs: "Přetáhněte sem aktivitu z knihovny", en: "Drag an activity here from the library" },
    { key: "planBoard.dragSlot", cs: "Přesunout celý blok", en: "Move whole slot" },
    { key: "planBoard.resize", cs: "Táhnutím změníte délku", en: "Drag to change duration" },
    { key: "planBoard.deleteSlot", cs: "Smazat celý blok", en: "Delete whole slot" },
    { key: "planBoard.deleteBlock", cs: "Odebrat aktivitu", en: "Remove activity" },
    { key: "planBoard.confirmDeleteSlot", cs: "Smazat celý blok včetně všech souběžných aktivit?", en: "Delete the whole slot including all parallel activities?" },
    { key: "planBoard.confirmDeleteBlock", cs: "Odebrat tuto aktivitu z plánu?", en: "Remove this activity from the plan?" },
    { key: "planBoard.conflictHint", cs: "Kolize: stejný vedoucí, místo nebo skupina ve stejný čas", en: "Conflict: same leader, location or group at the same time" },
    { key: "planBoard.copyHint", cs: "Přetažení přesouvá · s Alt/Ctrl kopíruje · přetažení na aktivitu = souběžně · spodní hrana mění délku", en: "Drag moves · hold Alt/Ctrl to copy · drop onto an activity = parallel · bottom edge changes duration" },
    { key: "planBoard.copyBadge", cs: "kopie", en: "copy" },
    { key: "planBoard.searchPlaceholder", cs: "Hledat aktivitu…", en: "Search activities…" },
    { key: "planBoard.remainingOnly", cs: "Jen dosud nezařazené", en: "Not yet scheduled only" },
    { key: "planBoard.libraryHint", cs: "Přetáhněte aktivitu do plánu.", en: "Drag an activity into the plan." },
    { key: "planBoard.libraryEmpty", cs: "Žádné aktivity.", en: "No activities." },
    { key: "planBoard.baseSection", cs: "Základní knihovna", en: "Base library" },
    { key: "planBoard.scopeDay", cs: "Den", en: "Day" },
    { key: "planBoard.scopeEvent", cs: "Celá akce", en: "Whole event" },
    { key: "planBoard.capacity", cs: "Kapacita", en: "Capacity" },
    { key: "planBoard.used", cs: "Naplánováno", en: "Planned" },
    { key: "planBoard.free", cs: "Volno", en: "Free" },
    { key: "planBoard.overflowLabel", cs: "Přečerpáno", en: "Overflow" },
    { key: "planBoard.warnings", cs: "Upozornění", en: "Warnings" },
    { key: "planBoard.warnOverflow", cs: "{window}: přečerpáno o {over} min", en: "{window}: over by {over} min" },
    { key: "planBoard.warnLeader", cs: "{name} vede v {time} současně „{a}“ a „{b}“", en: "{name} leads “{a}” and “{b}” at the same time ({time})" },
    { key: "planBoard.warnLocation", cs: "{name} je v {time} obsazeno „{a}“ i „{b}“", en: "{name} is used by “{a}” and “{b}” at the same time ({time})" },
    { key: "planBoard.errorLoad", cs: "Plán se nepodařilo načíst.", en: "Could not load the plan." },
    { key: "planBoard.errorSaveFailed", cs: "Uložení se nepodařilo.", en: "Save failed." },
    { key: "planBoard.errorStale", cs: "Změnu se nepodařilo uložit, plán byl znovu načten.", en: "The change could not be saved; the plan was reloaded." },
    { key: "planBoard.errorFixedWindow", cs: "Do pevného bloku (např. oběd) nelze vkládat aktivity.", en: "Activities can't be placed in a fixed block (e.g. lunch)." },
    { key: "planBoard.errorNoWindow", cs: "Cílový den nemá žádné okno pro program.", en: "The target day has no program window." },

    // Steps 6-7: block editor, duplicate day, print + CSV
    { key: "planBoard.addDayCopyWithProgram", cs: "Kopie dne {day} včetně programu", en: "Copy of {day} including its program" },
    { key: "planBoard.activity", cs: "Aktivita", en: "Activity" },
    { key: "planBoard.titleOverride", cs: "Vlastní název (jinak název aktivity)", en: "Custom title (otherwise the activity name)" },
    { key: "planBoard.slotDuration", cs: "Délka (min)", en: "Duration (min)" },
    { key: "planBoard.slotDurationShared", cs: "Platí pro všechny souběžné aktivity v tomto bloku.", en: "Applies to all parallel activities in this slot." },
    { key: "planBoard.leader", cs: "Vedoucí", en: "Leader" },
    { key: "planBoard.location", cs: "Místo", en: "Location" },
    { key: "planBoard.time", cs: "Čas", en: "Time" },
    { key: "planBoard.parallel", cs: "Souběžně s jinou aktivitou", en: "Runs in parallel with another activity" },
    { key: "planBoard.print", cs: "Tisk", en: "Print" },
    { key: "planBoard.csv", cs: "CSV", en: "CSV" },
    { key: "planBoard.allLeaders", cs: "Všichni vedoucí", en: "All leaders" },
    { key: "planBoard.printFor", cs: "Program pro: {name}", en: "Schedule for: {name}" },
    { key: "planBoard.printEmpty", cs: "Na tento den není nic naplánováno.", en: "Nothing planned for this day." },

    // Step 8: participant groups
    { key: "planBoard.groups", cs: "Skupiny", en: "Groups" },
    { key: "planBoard.groupsHint", cs: "Bez výběru = pro všechny. Skupiny se berou ze seznamu účastníků (pole Skupina).", en: "None selected = everyone. Groups come from the participant list (Group field)." },
    { key: "planBoard.groupsNone", cs: "Účastníci zatím nemají vyplněnou skupinu.", en: "No participant has a group yet." },
    { key: "planBoard.allGroups", cs: "Všechny skupiny", en: "All groups" },
    { key: "planBoard.warnGroup", cs: "Skupina {name} má v {time} současně „{a}“ a „{b}“", en: "Group {name} has “{a}” and “{b}” at the same time ({time})" },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
    console.log(`  ok: ${row.key}`);
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
