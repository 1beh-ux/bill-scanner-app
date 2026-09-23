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
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
    console.log(`  ok: ${row.key}`);
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
