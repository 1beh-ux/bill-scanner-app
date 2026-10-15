// Usage metrics & cost tracking (/vyuziti, super-admin): translations, and the GCP list prices
// as a starting point -- only when none are saved yet (the page edits them).
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    { key: "nav.usage", cs: "Využití", en: "Usage" },
    { key: "usage.title", cs: "Využití a náklady", en: "Usage and costs" },
    { key: "usage.tab.activity", cs: "Aktivita", en: "Activity" },
    { key: "usage.tab.costs", cs: "Náklady", en: "Costs" },
    { key: "usage.tab.prices", cs: "Ceny GCP", en: "GCP prices" },
    { key: "usage.period", cs: "Období", en: "Period" },
    { key: "usage.period.7", cs: "Posledních 7 dní", en: "Last 7 days" },
    { key: "usage.period.30", cs: "Posledních 30 dní", en: "Last 30 days" },
    { key: "usage.period.90", cs: "Posledních 90 dní", en: "Last 90 days" },
    { key: "usage.period.365", cs: "Posledních 12 měsíců", en: "Last 12 months" },
    { key: "usage.period.0", cs: "Celkem", en: "All time" },
    { key: "usage.loadFailed", cs: "Data se nepodařilo načíst.", en: "Couldn't load the data." },
    { key: "usage.organization", cs: "Organizace", en: "Organization" },
    { key: "usage.organizations", cs: "Organizace", en: "Organizations" },
    { key: "usage.allOrgs", cs: "Všechny organizace", en: "All organizations" },
    { key: "usage.event", cs: "Akce", en: "Event" },
    { key: "usage.allEvents", cs: "Všechny akce", en: "All events" },
    { key: "usage.withSuper", cs: "včetně super-admina", en: "including super-admin" },
    { key: "usage.active7", cs: "Aktivní (7 dní)", en: "Active (7 days)" },
    { key: "usage.activeP", cs: "Aktivní (období)", en: "Active (period)" },
    { key: "usage.views7", cs: "Zobrazení (7 dní)", en: "Views (7 days)" },
    { key: "usage.viewsP", cs: "Zobrazení (období)", en: "Views (period)" },
    { key: "usage.actionsP", cs: "Akce (období)", en: "Actions (period)" },
    { key: "usage.lastActive", cs: "Naposledy", en: "Last active" },
    { key: "usage.users", cs: "Uživatelé", en: "Users" },
    { key: "usage.user", cs: "Uživatel", en: "User" },
    { key: "usage.topModule", cs: "Nejčastější modul", en: "Top module" },
    { key: "usage.pages", cs: "Stránky", en: "Pages" },
    { key: "usage.route", cs: "Stránka", en: "Page" },
    { key: "usage.views", cs: "Zobrazení", en: "Views" },
    { key: "usage.distinctUsers", cs: "Uživatelů", en: "Users" },
    { key: "usage.actionsHint", cs: "Akce = úpravy a schválení účtenek, akce v Poště a odeslané e-maily rodičům.", en: "Actions = bill edits and approvals, Mail actions and e-mails sent to parents." },
    { key: "usage.backToUsers", cs: "Zpět na uživatele", en: "Back to users" },
    { key: "usage.dailyViews90", cs: "Zobrazení po dnech (90 dní)", en: "Views per day (90 days)" },
    { key: "usage.topRoutes", cs: "Nejčastější stránky", en: "Top pages" },
    { key: "usage.eventsVisited", cs: "Navštívené akce", en: "Events visited" },
    { key: "usage.eventsCount", cs: "Akcí", en: "Events" },
    { key: "usage.aiCost", cs: "AI náklady", en: "AI cost" },
    { key: "usage.aiCalls", cs: "AI volání", en: "AI calls" },
    { key: "usage.billsProcessed", cs: "Zpracovaných účtenek", en: "Bills processed" },
    { key: "usage.storage", cs: "Úložiště", en: "Storage" },
    { key: "usage.storageMonth", cs: "Úložiště / měsíc", en: "Storage / month" },
    { key: "usage.total", cs: "Celkem", en: "Total" },
    { key: "usage.grandTotal", cs: "Celkem za všechny", en: "Grand total" },
    { key: "usage.priceNotSet", cs: "cena nenastavena", en: "price not set" },
    { key: "usage.unpricedCalls", cs: "{count} volání bez ceny", en: "{count} calls without a price" },
    { key: "usage.unmeasured", cs: "{count} souborů ještě nemá změřenou velikost (scripts/backfill-gcs-sizes.ts).", en: "{count} files have no measured size yet (scripts/backfill-gcs-sizes.ts)." },
    { key: "usage.monthlyAi", cs: "AI náklady po měsících (12 měsíců)", en: "AI cost per month (12 months)" },
    { key: "usage.noEventStorage", cs: "Dokumenty osob (bez akce)", en: "People's documents (no event)" },
    { key: "usage.avgPerBill", cs: "Průměr na účtenku", en: "Average per bill" },
    { key: "usage.reprocessFailed", cs: "{reprocess} znovu, {failed} chyb", en: "{reprocess} reprocessed, {failed} failed" },
    { key: "usage.byUser", cs: "Podle uživatele", en: "By user" },
    { key: "usage.byPurpose", cs: "Podle účelu", en: "By purpose" },
    { key: "usage.purpose", cs: "Účel", en: "Purpose" },
    { key: "usage.purpose.bill_extraction", cs: "Vytěžení účtenky", en: "Bill extraction" },
    { key: "usage.purpose.bill_reprocess", cs: "Znovu zpracovat", en: "Reprocess" },
    { key: "usage.automatic", cs: "Automaticky", en: "Automatic" },
    { key: "usage.topBills", cs: "Nejdražší účtenky", en: "Most expensive bills" },
    { key: "usage.bill", cs: "Účtenka", en: "Bill" },
    { key: "usage.billGone", cs: "(smazaná / sloučená)", en: "(deleted / merged)" },
    { key: "usage.storageByKind", cs: "Úložiště podle typu", en: "Storage by type" },
    { key: "usage.storageByUploader", cs: "Úložiště podle nahrávajícího", en: "Storage by uploader" },
    { key: "usage.files", cs: "Souborů", en: "Files" },
    { key: "usage.uploaderNone", cs: "Rodič (portál)", en: "Parent (portal)" },
    { key: "usage.kind.bills", cs: "Účtenky", en: "Bills" },
    { key: "usage.kind.incident_photos", cs: "Fotky úrazů", en: "Incident photos" },
    { key: "usage.kind.parent_summaries", cs: "Souhrny pro rodiče", en: "Parent summaries" },
    { key: "usage.kind.participant_documents", cs: "Dokumenty účastníků", en: "Participant documents" },
    { key: "usage.kind.person_documents", cs: "Dokumenty osob", en: "People's documents" },
    { key: "usage.estimateNote", cs: "Odhad z měření aplikace; sdílená infrastruktura není zahrnuta.", en: "Estimate from the app's own metering; shared infrastructure isn't included." },
    { key: "usage.totalNote", cs: "Celkem = AI náklady za období + úložiště za měsíc.", en: "Total = AI cost for the period + storage per month." },
    { key: "usage.pricesHint", cs: "Ceníkové ceny v USD. Nová AI volání se ocení podle těchto cen; dřívější si nechávají svou cenu.", en: "List prices in USD. New AI calls are costed with these; earlier calls keep their price." },
    { key: "usage.priceInput", cs: "Vstup / 1M tokenů", en: "Input / 1M tokens" },
    { key: "usage.priceOutput", cs: "Výstup / 1M tokenů", en: "Output / 1M tokens" },
    { key: "usage.priceGcs", cs: "Cloud Storage / GB měsíc", en: "Cloud Storage / GB-month" },
    { key: "usage.pricesSaved", cs: "Ceny uloženy.", en: "Prices saved." },
    { key: "usage.pricesInvalid", cs: "Ceny se nepodařilo uložit (jen nezáporná čísla).", en: "Couldn't save the prices (non-negative numbers only)." },
    { key: "usage.eventCard", cs: "Náklady", en: "Costs" },
    { key: "usage.eventCardDetail", cs: "AI {ai} ({calls} volání) · úložiště {gb} GB, {storage} / měsíc", en: "AI {ai} ({calls} calls) · storage {gb} GB, {storage} / month" },
    { key: "usage.eventCardLink", cs: "Podrobnosti →", en: "Details →" },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  // Vertex AI Gemini 2.5 Pro (prompts ≤ 200K tokens) and Cloud Storage Standard, Oct 2026 list prices.
  const seeded = await prisma.appSetting.createMany({
    data: [{ key: "gcpPrices", value: { models: { "gemini-2.5-pro": { input: 1.25, output: 10 } }, gcsGbMonth: 0.023 } }],
    skipDuplicates: true,
  });
  console.log(`  ok: ${rows.length} usage keys${seeded.count ? ", default GCP prices" : ""}`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
