// Idempotent: adds translation keys that are missing (or have an empty cs/en) and
// NEVER overwrites an existing non-empty text. Safe to run repeatedly, locally and
// against production. Collects the keys added by the roles/payers/Drive/bills work
// (see docs/drive-payers-roles-change-notes.md) plus anything the audit found missing.
//
//   npx tsx scripts/seed-missing-translations.ts
//
// Sequence against a live DB: scripts/audit-translations.ts -> this script -> audit again.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };

export const ROWS: Row[] = [
  // -- Part 8: confirmation dialog -------------------------------------------
  { key: "confirmDialog.title", cs: "Potvrzení", en: "Please confirm" },
  { key: "confirmDialog.dangerTitle", cs: "Jste si jisti?", en: "Are you sure?" },
  { key: "confirmDialog.noticeTitle", cs: "Upozornění", en: "Notice" },
  { key: "common.confirm", cs: "Potvrdit", en: "Confirm" },
  { key: "common.ok", cs: "OK", en: "OK" },
  { key: "authors.mergeConfirmButton", cs: "Sloučit", en: "Merge" },
  { key: "participantFieldAdmin.confirmRenameButton", cs: "Přejmenovat", en: "Rename" },
  { key: "billModal.markPaidConfirm", cs: "Označit tuto účtenku jako vyplacenou plátci?", en: "Mark this bill as paid out to the payer?" },
  { key: "billModal.markUnpaidConfirm", cs: "Zrušit u této účtenky označení „vyplaceno“?", en: "Remove the “paid out” mark from this bill?" },
  { key: "billsPage.confirmBulkApprove", cs: "Schválit vybrané účtenky (počet: {count})? Schválení lze vrátit tlačítkem „Znovu otevřít“ na detailu účtenky.", en: "Approve the selected bills (count: {count})? An approval can be undone with “Reopen” on the bill detail." },
  { key: "billsPage.confirmBulkMarkPaid", cs: "Označit vybrané účtenky jako vyplacené (počet: {count})?", en: "Mark the selected bills as paid out (count: {count})?" },
  { key: "billsPage.confirmBulkMarkUnpaid", cs: "Zrušit u vybraných účtenek označení „vyplaceno“ (počet: {count})?", en: "Remove the “paid out” mark from the selected bills (count: {count})?" },

  // -- Part 2/3: payers (Plátci) + payments page --------------------------------
  { key: "nav.payers", cs: "Plátci", en: "Payers" },
  { key: "payers.title", cs: "Plátci", en: "Payers" },
  { key: "payers.intro", cs: "Plátci této akce. Účtenku lze přiřadit jen plátci z tohoto seznamu. Odebráním plátce z akce zůstanou jeho existující účtenky beze změny.", en: "The payers of this event. A bill can only be given a payer from this list. Removing a payer from the event leaves their existing bills unchanged." },
  { key: "payers.colName", cs: "Jméno", en: "Name" },
  { key: "payers.colAccount", cs: "Bankovní účet", en: "Bank account" },
  { key: "payers.colBills", cs: "Účtenky", en: "Bills" },
  { key: "payers.addNew", cs: "Nový plátce", en: "New payer" },
  { key: "payers.attachExisting", cs: "Vybrat existujícího", en: "Pick existing" },
  { key: "payers.attach", cs: "Přidat do akce", en: "Add to event" },
  { key: "payers.searchPlaceholder", cs: "Hledat plátce podle jména…", en: "Search payers by name…" },
  { key: "payers.searchHint", cs: "Zobrazí se jen jména plátců, kteří v této akci ještě nejsou. Bankovní údaje se ukážou až po přidání.", en: "Only names of payers not yet in this event are shown. Bank details appear after adding." },
  { key: "payers.searchNone", cs: "Nikdo takový nenalezen.", en: "Nobody found." },
  { key: "payers.none", cs: "Tato akce zatím nemá žádné plátce.", en: "This event has no payers yet." },
  { key: "payers.remove", cs: "Odebrat z akce", en: "Remove from event" },
  { key: "payers.noBank", cs: "Chybí bankovní účet", en: "Bank account missing" },
  { key: "payers.bankChanged", cs: "změněno {date} uživatelem {name}", en: "changed {date} by {name}" },
  { key: "payers.nameLabel", cs: "Jméno a příjmení", en: "Full name" },
  { key: "payers.accountLabel", cs: "Číslo účtu (např. 19-2000145399)", en: "Account number (e.g. 19-2000145399)" },
  { key: "payers.bankCodeLabel", cs: "Kód banky", en: "Bank code" },
  { key: "payers.bankOptionalHint", cs: "Bankovní údaje lze doplnit později; když je zadáte, vyplňte číslo účtu i kód banky.", en: "Bank details can be added later; if you enter them, fill in both the account number and the bank code." },
  { key: "payers.create", cs: "Vytvořit plátce", en: "Create payer" },
  { key: "payers.similarTitle", cs: "Podobný plátce už existuje:", en: "A similar payer already exists:" },
  { key: "payers.useExisting", cs: "Použít tohoto", en: "Use this one" },
  { key: "payers.createAnyway", cs: "Přesto vytvořit nového", en: "Create a new one anyway" },
  { key: "payers.newPayerOption", cs: "+ Nový plátce", en: "+ New payer" },
  { key: "payers.newPayerNamed", cs: "+ Nový plátce „{name}“", en: "+ New payer “{name}”" },
  { key: "payers.confirmRemove", cs: "Odebrat plátce „{name}“ z této akce? Plátce zůstane v systému a půjde přidat znovu.", en: "Remove payer “{name}” from this event? They stay in the system and can be added again." },
  { key: "payers.confirmRemoveWithBills", cs: "Plátce „{name}“ má v této akci účtenky (počet: {count}). Po odebrání u něj zůstanou beze změny, jen se plátce nebude nabízet při výběru. Opravdu odebrat?", en: "Payer “{name}” has bills in this event (count: {count}). After removal they stay with the payer unchanged; the payer is just no longer offered in selectors. Really remove?" },
  { key: "payers.error.name_required", cs: "Zadejte jméno plátce.", en: "Enter the payer's name." },
  { key: "payers.error.name_too_long", cs: "Jméno je příliš dlouhé.", en: "The name is too long." },
  { key: "payers.error.bank_incomplete", cs: "Vyplňte číslo účtu i kód banky, nebo obojí nechte prázdné.", en: "Fill in both the account number and the bank code, or leave both empty." },
  { key: "payers.error.invalid_bank_account", cs: "Neplatné číslo účtu nebo kód banky.", en: "Invalid account number or bank code." },
  { key: "payers.error.payer_not_found", cs: "Plátce nenalezen (nebo není u této akce).", en: "Payer not found (or not attached to this event)." },
  { key: "payers.error.payer_has_bills", cs: "Plátce má v této akci účtenky – potvrďte odebrání.", en: "The payer has bills in this event – confirm the removal." },
  { key: "payers.error.payer_not_in_event", cs: "Tento plátce není přiřazen k akci.", en: "This payer is not attached to the event." },
  { key: "payers.error.similar_payer_exists", cs: "Podobný plátce už existuje.", en: "A similar payer already exists." },
  { key: "payers.error.admin_only", cs: "Tuto akci může provést jen administrátor.", en: "Only an administrator can do this." },
  { key: "payers.error.generic", cs: "Něco se nepovedlo, zkuste to znovu.", en: "Something went wrong, please try again." },
  { key: "paymentsPage.emptyAll", cs: "Žádné účtenky s plátcem.", en: "No bills with a payer." },
  { key: "paymentsPage.bills.one", cs: "účtenka", en: "bill" },
  { key: "paymentsPage.bills.few", cs: "účtenky", en: "bills" },
  { key: "paymentsPage.bills.many", cs: "účtenek", en: "bills" },
  { key: "paymentsPage.removedFromEvent", cs: "Plátce byl z této akce odebrán, ale stále je mu dlužné.", en: "This payer was removed from the event but is still owed money here." },
  { key: "paymentsPage.alreadyPaidOut", cs: "již vyplaceno {amount}, počet: {count}", en: "already paid out {amount}, count: {count}" },
  { key: "paymentsPage.itemPaidOut", cs: "vyplaceno", en: "paid out" },
  { key: "common.adminOnly", cs: "Tato stránka je jen pro administrátory.", en: "This page is for administrators only." },
  { key: "authors.globalIntro", cs: "Všichni plátci ze všech akcí. Uživatelé akcí spravují jen plátce své akce; tady je sloučíte, upravíte nebo deaktivujete a uvidíte historii změn bankovních účtů.", en: "All payers across all events. Event users only manage the payers of their own event; here you merge, edit or deactivate them and see the history of bank-account changes." },
  { key: "authors.colEvents", cs: "Akce", en: "Events" },
  { key: "authors.bankHistory", cs: "Historie účtu", en: "Account history" },
  { key: "authors.bankHistoryEmpty", cs: "Bankovní údaje se zatím nezměnily.", en: "The bank details have not changed yet." },
  { key: "authors.auditSource.event_edit", cs: "úprava v akci", en: "edit in an event" },
  { key: "authors.auditSource.admin_edit", cs: "úprava administrátorem", en: "admin edit" },
  { key: "authors.auditSource.merge", cs: "sloučení", en: "merge" },
  { key: "authors.auditSource.create", cs: "vytvoření", en: "created" },
  { key: "authors.auditSource.import", cs: "import", en: "import" },

  // -- Part 4: per-user Google account, Drive diagnostics ---------------------------
  { key: "driveSettings.error.not_a_folder_id", cs: "Toto není ID složky Google Drive. Vložte ID, nebo odkaz na složku (…/folders/…).", en: "This is not a Google Drive folder ID. Paste the ID or a link to the folder (…/folders/…)." },
  { key: "driveSettings.error.is_a_file", cs: "Toto ID patří souboru, ne složce. Otevřete složku na Disku a zkopírujte její ID.", en: "This ID belongs to a file, not a folder. Open the folder in Drive and copy its ID." },
  { key: "driveSettings.error.not_found_or_no_access", cs: "{folder}: složka nebo soubor neexistuje, nebo k němu účet {identity} nemá přístup. Požádejte vlastníka, ať ho tomuto účtu nasdílí jako Editor.", en: "{folder}: the folder or file does not exist, or the account {identity} has no access to it. Ask the owner to share it with that account as Editor." },
  { key: "driveSettings.error.read_only_access", cs: "{folder}: účet {identity} má ke složce jen právo číst. Pro zápis je potřeba role Editor – požádejte vlastníka o změnu sdílení.", en: "{folder}: the account {identity} can only read this folder. Writing needs the Editor role – ask the owner to change the sharing." },
  { key: "driveSettings.error.service_account_no_quota", cs: "{folder}: servisní účet ({serviceAccount}) nemůže ukládat soubory do osobního Disku. Použijte sdílený disk (Shared Drive), nebo připojte svůj Google účet.", en: "{folder}: the service account ({serviceAccount}) cannot store files in a personal Drive. Use a Shared Drive, or connect your Google account." },
  { key: "driveSettings.error.storage_quota_exceeded", cs: "{folder}: úložiště Google účtu {identity} je plné. Uvolněte místo, nebo použijte jiný účet.", en: "{folder}: the storage of the Google account {identity} is full. Free up space or use another account." },
  { key: "driveSettings.error.token_invalid", cs: "Připojení ke Google vypršelo nebo bylo zrušeno (účet {identity}). Připojte svůj Google účet znovu.", en: "The Google connection expired or was revoked (account {identity}). Connect your Google account again." },
  { key: "driveSettings.error.drive_rate_limited", cs: "Google dočasně omezil počet požadavků. Zkuste to za chvíli znovu.", en: "Google is temporarily limiting requests. Please try again shortly." },
  { key: "driveSettings.error.drive_unavailable", cs: "Google Drive je dočasně nedostupný. Zkuste to za chvíli znovu.", en: "Google Drive is temporarily unavailable. Please try again shortly." },
  { key: "driveSettings.error.manifest_missing", cs: "Soubor s manifestem (tabulka) byl smazán, nebo k němu účet {identity} nemá přístup. Můžete vytvořit nový.", en: "The manifest spreadsheet was deleted, or the account {identity} cannot reach it. You can create a new one." },
  { key: "driveSettings.error.drive_unknown", cs: "Google Drive vrátil neočekávanou chybu. Zkuste to znovu; pokud přetrvává, kontaktujte administrátora.", en: "Google Drive returned an unexpected error. Try again; if it persists, contact an administrator." },
  { key: "driveSettings.error.same_folder", cs: "Složka pro import a složka pro export jsou stejné – exportované soubory by se při dalším importu načetly znovu jako nové účtenky. Použijte dvě různé složky.", en: "The import and export folders are the same – exported files would be imported again as new bills. Use two different folders." },
  { key: "driveSettings.folder.ingest", cs: "Složka pro import", en: "Import folder" },
  { key: "driveSettings.folder.export", cs: "Složka pro export", en: "Export folder" },
  { key: "driveSettings.folder.participants", cs: "Složka účastníků", en: "Participants folder" },
  { key: "driveSettings.folder.generic", cs: "Složka", en: "Folder" },
  { key: "driveSettings.warning.no_connection", cs: "Nikdo zatím pro tuto akci nepřipojil Google účet, proto se používá servisní účet – ten nemůže zapisovat do osobního Disku (jen do sdílených disků).", en: "Nobody has connected a Google account for this event yet, so the service account is used – it cannot write to a personal Drive (only to Shared Drives)." },
  { key: "driveSettings.warning.token_invalid", cs: "Připojení uživatele {name} vypršelo nebo bylo zrušeno, proto se používá servisní účet. Uživatel musí svůj Google účet připojit znovu.", en: "The connection of {name} expired or was revoked, so the service account is used. They need to reconnect their Google account." },
  { key: "driveSettings.warning.user_inactive", cs: "Uživatel {name}, který Drive této akce nastavil, je deaktivován, proto se používá servisní účet. Převezměte správu Drive.", en: "{name}, who set up this event's Drive, is deactivated, so the service account is used. Take over the Drive management." },
  { key: "driveSettings.identityTitle", cs: "Účet pro Drive této akce", en: "Account for this event's Drive" },
  { key: "driveSettings.identityUser", cs: "Drive akce používá účet {email} (připojil/a {name}, {date}).", en: "This event's Drive uses the account {email} (connected by {name}, {date})." },
  { key: "driveSettings.identityFallback", cs: "Drive akce právě používá servisní účet {email}.", en: "This event's Drive is currently using the service account {email}." },
  { key: "driveSettings.meConnected", cs: "Váš Google účet: {email}", en: "Your Google account: {email}" },
  { key: "driveSettings.meExpired", cs: "Váš Google účet {email} vyžaduje opětovné připojení.", en: "Your Google account {email} needs to be reconnected." },
  { key: "driveSettings.meNotConnected", cs: "Nemáte připojený žádný Google účet.", en: "You have no Google account connected." },
  { key: "driveSettings.connectMine", cs: "Připojit můj Google účet", en: "Connect my Google account" },
  { key: "driveSettings.takeOver", cs: "Převzít správu Drive této akce", en: "Take over this event's Drive" },
  { key: "driveSettings.connectInUse", cs: "Tento Google účet už má připojený jiný uživatel.", en: "This Google account is already connected by another user." },
  { key: "driveSettings.accessNeeded", cs: "Účet {email} musí mít ke každé složce (a k tabulkám pro import) roli Editor.", en: "The account {email} needs the Editor role on every folder (and on the sheets used for import)." },
  { key: "driveSettings.accessNeededSa", cs: "Servisní účet {email} pracuje jen se sdílenými disky (Shared Drive), kde je členem s rolí Editor nebo Správce obsahu.", en: "The service account {email} only works with Shared Drives where it is a member with the Editor or Content manager role." },
  { key: "driveSettings.accessRoles", cs: "Import z Disku složku jen čte; export a složka účastníků do ní zapisují.", en: "Importing from Drive only reads the folder; the export and the participants folder write to it." },
  { key: "driveSettings.folderPlaceholder", cs: "ID složky nebo odkaz na složku", en: "Folder ID or a link to the folder" },
  { key: "driveSettings.resolvedId", cs: "Rozpoznané ID:", en: "Recognised ID:" },
  { key: "driveSettings.saved", cs: "Uloženo", en: "Saved" },
  { key: "driveSettings.recreateManifest", cs: "Vytvořit manifest znovu", en: "Create the manifest again" },
  { key: "settingsPage.googleTitle", cs: "Google účet", en: "Google account" },
  { key: "settingsPage.googleHint", cs: "Účet, pod kterým aplikace pracuje s Google Drive, Tabulkami a Dokumenty u akcí, jejichž Drive jste nastavili vy.", en: "The account the app uses for Google Drive, Sheets and Docs on events whose Drive you set up." },
  { key: "settingsPage.googleConnected", cs: "Připojeno jako {email} (od {date}).", en: "Connected as {email} (since {date})." },
  { key: "settingsPage.googleExpired", cs: "Účet {email} je připojen, ale Google odmítl přístup – připojte ho znovu.", en: "The account {email} is connected but Google rejected access – reconnect it." },
  { key: "settingsPage.googleNotConnected", cs: "Nemáte připojený žádný Google účet.", en: "You have no Google account connected." },
  { key: "settingsPage.googleUsedBy", cs: "Používá se u akcí: {events}.", en: "Used by the events: {events}." },
  { key: "settingsPage.googleDisconnectButton", cs: "Odpojit", en: "Disconnect" },
  { key: "settingsPage.googleDisconnect", cs: "Odpojit váš Google účet?", en: "Disconnect your Google account?" },
  { key: "settingsPage.googleDisconnectWithEvents", cs: "Odpojit váš Google účet? Tyto akce jsou nastavené na váš účet a přejdou na servisní účet (s varováním), dokud někdo nepřevezme jejich Drive: {events}", en: "Disconnect your Google account? These events are set up on your account and will fall back to the service account (with a warning) until someone takes over their Drive: {events}" },

  // -- Part 5: import result --------------------------------------------------------
  { key: "importPage.result.title", cs: "Výsledek posledního načtení", en: "Result of the last run" },
  { key: "importPage.result.summary", cs: "Importováno: {imported}, duplicity: {duplicates}, přeskočeno: {skipped}, chyb: {failed}", en: "Imported: {imported}, duplicates: {duplicates}, skipped: {skipped}, failed: {failed}" },
  { key: "importPage.result.nothing", cs: "Nic nového k importu.", en: "Nothing new to import." },
  { key: "importPage.result.payers", cs: "Plátci ze složek – spárováno: {matched}; nově vytvořeno: {created}", en: "Payers from the folders – matched: {matched}; newly created: {created}" },
  { key: "importPage.result.split", cs: "{name}: vícestránkové PDF rozděleno na stránky (počet: {count})", en: "{name}: multi-page PDF split into pages (count: {count})" },
  { key: "importPage.result.kind.imported", cs: "Importováno", en: "Imported" },
  { key: "importPage.result.kind.duplicate", cs: "Duplicita", en: "Duplicate" },
  { key: "importPage.result.kind.skipped", cs: "Přeskočeno", en: "Skipped" },
  { key: "importPage.result.kind.failed", cs: "Chyba", en: "Failed" },
  { key: "importPage.dupOf", cs: "stejný soubor už v akci je jako „{name}“", en: "the same file already exists in the event as “{name}”" },
  { key: "importPage.skip.already", cs: "už bylo dříve importováno", en: "already imported earlier" },
  { key: "importPage.skip.native", cs: "Google dokument nebo tabulku nelze importovat jako účtenku", en: "a Google Doc/Sheet cannot be imported as a bill" },
  { key: "importPage.failure.invalid_pdf", cs: "soubor není platné PDF", en: "the file is not a valid PDF" },

  // -- Part 6: admin overview ------------------------------------------------------
  { key: "nav.adminOverview", cs: "Přehled akcí", en: "Events overview" },
  { key: "adminOverview.title", cs: "Přehled akcí a Google připojení", en: "Events and Google connections overview" },
  { key: "adminOverview.intro", cs: "Jen pro čtení. Zvýrazněné řádky vyžadují pozornost: Drive akce používá servisní účet, nebo je uživatel, který Drive nastavil, neaktivní.", en: "Read-only. Highlighted rows need attention: the event's Drive falls back to the service account, or the user who set up the Drive is inactive." },
  { key: "adminOverview.colEvent", cs: "Akce", en: "Event" },
  { key: "adminOverview.colUsers", cs: "Uživatelé s přístupem", en: "Users with access" },
  { key: "adminOverview.colDrive", cs: "Drive (účet)", en: "Drive (account)" },
  { key: "adminOverview.colBills", cs: "Účtenky podle stavu", en: "Bills by status" },
  { key: "adminOverview.colBudget", cs: "Utraceno / rozpočet", en: "Spent / budget" },
  { key: "adminOverview.colPayers", cs: "Plátci", en: "Payers" },
  { key: "adminOverview.driveNone", cs: "Drive není nastaven", en: "Drive not set up" },
  { key: "adminOverview.driveUser", cs: "účet uživatele {name}", en: "account of {name}" },
  { key: "adminOverview.driveServiceAccount", cs: "servisní účet", en: "service account" },
  { key: "adminOverview.warning.no_connection", cs: "Nikdo nepřipojil Google účet", en: "Nobody connected a Google account" },
  { key: "adminOverview.warning.token_invalid", cs: "Připojení Google vypršelo", en: "The Google connection expired" },
  { key: "adminOverview.warning.user_inactive", cs: "Uživatel je neaktivní", en: "The user is inactive" },
  { key: "adminOverview.configuredByInactive", cs: "Drive nastavil neaktivní uživatel {name}", en: "Drive set up by the inactive user {name}" },
  { key: "adminOverview.ofBudget", cs: "z {budget}", en: "of {budget}" },
  { key: "adminOverview.noBudget", cs: "rozpočet nenastaven", en: "no budget set" },
  { key: "adminOverview.googleTitle", cs: "Google připojení", en: "Google connections" },
  { key: "adminOverview.googleNone", cs: "Nikdo zatím nepřipojil Google účet.", en: "Nobody has connected a Google account yet." },
  { key: "adminOverview.colUser", cs: "Uživatel", en: "User" },
  { key: "adminOverview.colGoogle", cs: "Google účet", en: "Google account" },
  { key: "adminOverview.colValid", cs: "Platnost", en: "Validity" },
  { key: "adminOverview.colUsedBy", cs: "Používá se u akcí", en: "Used by events" },
  { key: "adminOverview.valid", cs: "platné", en: "valid" },
  { key: "adminOverview.expired", cs: "vypršelo – nutné připojit znovu", en: "expired – reconnect needed" },
  { key: "adminOverview.inactiveUser", cs: "(neaktivní)", en: "(inactive)" },
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  let created = 0;
  let filled = 0;
  let untouched = 0;
  for (const row of ROWS) {
    const existing = await prisma.translation.findUnique({ where: { key: row.key } });
    if (!existing) {
      await prisma.translation.create({ data: row });
      created++;
    } else if (!existing.cs.trim() || !existing.en.trim()) {
      await prisma.translation.update({
        where: { key: row.key },
        data: { cs: existing.cs.trim() ? existing.cs : row.cs, en: existing.en.trim() ? existing.en : row.en },
      });
      filled++;
    } else {
      untouched++;
    }
  }
  console.log(`seed-missing-translations: created ${created}, filled empty ${filled}, left as is ${untouched} (of ${ROWS.length})`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}
