// Idempotent: adds translation keys that are missing (or have an empty cs/en) and
// NEVER overwrites an existing non-empty text. Safe to run repeatedly, locally and
// against production. Collects the keys added by the roles/payers/Drive/bills work
// (see docs/drive-payers-roles-change-notes.md) plus anything the audit found missing.
//
//   npx tsx scripts/seed-missing-translations.ts
//
// Sequence against a live DB: scripts/audit-translations.ts -> this script -> audit again.
import { config } from "dotenv";
import { seedDefinitions } from "./lib/translation-sources";
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
  { key: "billModal.markPaidConfirm", cs: "Označit tuto účtenku jako proplacenou plátci?", en: "Mark this bill as paid out to the payer?" },
  { key: "billModal.markUnpaidConfirm", cs: "Zrušit u této účtenky označení „proplaceno“?", en: "Remove the “paid out” mark from this bill?" },
  { key: "billsPage.confirmBulkApprove", cs: "Schválit vybrané účtenky (počet: {count})? Schválení lze vrátit tlačítkem „Znovu otevřít“ na detailu účtenky.", en: "Approve the selected bills (count: {count})? An approval can be undone with “Reopen” on the bill detail." },
  { key: "billsPage.confirmBulkMarkPaid", cs: "Označit vybrané účtenky jako proplacené (počet: {count})?", en: "Mark the selected bills as paid out (count: {count})?" },
  { key: "billsPage.confirmBulkMarkUnpaid", cs: "Zrušit u vybraných účtenek označení „proplaceno“ (počet: {count})?", en: "Remove the “paid out” mark from the selected bills (count: {count})?" },

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
  { key: "paymentsPage.alreadyPaidOut", cs: "již proplaceno {amount}, počet: {count}", en: "already paid out {amount}, count: {count}" },
  { key: "paymentsPage.itemPaidOut", cs: "proplaceno", en: "paid out" },
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

  // -- Part 7: blank pages when splitting PDFs ------------------------------------
  { key: "importPage.result.blankSkipped", cs: "Přeskočeno prázdných stránek: {count} ({details})", en: "Blank pages skipped: {count} ({details})" },
  { key: "importPage.result.blankDetail", cs: "strana {pages} v souboru {name}", en: "page {pages} of the file {name}" },

  // -- Part 9: foreign-currency preview / rates ---------------------------------------
  { key: "billModal.fxPreview", cs: "≈ {amount} Kč (kurz {rate} za den {date})", en: "≈ {amount} CZK (rate {rate} for {date})" },
  { key: "billModal.fxRateOnly", cs: "Kurz {rate} za den {date} – zadejte částku pro přepočet.", en: "Rate {rate} for {date} – enter an amount to convert." },
  { key: "billModal.fxLoading", cs: "Zjišťuji kurz…", en: "Looking up the rate…" },
  { key: "billModal.fxMissingDate", cs: "Přepočet na Kč není možný, protože chybí datum účtenky.", en: "CZK conversion is not possible because the bill date is missing." },
  { key: "billModal.fxRateUnavailable", cs: "Kurz ČNB pro toto datum se nepodařilo získat. Zkuste to za chvíli znovu.", en: "The ČNB rate for this date could not be fetched. Try again shortly." },
  { key: "rates.onDemandNote", cs: "Kurz pro starší účtenku se při jejím uložení stáhne z ČNB automaticky – doplňování historie slouží jen k naplnění tohoto přehledu.", en: "The rate for an older bill is fetched from ČNB automatically when the bill is saved – backfilling only fills this overview." },

  // -- Part 10: budget page at zero budgets -----------------------------------------
  { key: "budgetPage.notSet", cs: "Rozpočet nenastaven", en: "No budget set" },
  { key: "budgetPage.noBudgetsHint", cs: "Rozpočty nejsou nastaveny – nastavíte je v Nastavení akce → Kategorie.", en: "No budgets are set – set them in Event settings → Categories." },
  { key: "budgetPage.noBudgetsLink", cs: "Otevřít Nastavení akce", en: "Open event settings" },

  // -- Part 11: bills list columns + paid status --------------------------------------
  { key: "billsPage.columnsButton", cs: "Sloupce", en: "Columns" },
  { key: "billsPage.columnsPickerTitle", cs: "Sloupce seznamu účtenek (pro celou akci)", en: "Bills list columns (for the whole event)" },
  { key: "billsPage.columnsReset", cs: "Obnovit výchozí", en: "Restore default" },
  { key: "billsPage.colNote", cs: "Poznámka", en: "Note" },
  { key: "billsPage.colAmountCzk", cs: "Částka v Kč", en: "Amount in CZK" },
  { key: "billsPage.colPaid", cs: "Proplaceno", en: "Paid out" },
  { key: "billsPage.colCreatedAt", cs: "Vloženo", en: "Added" },
  { key: "billsPage.colCreatedBy", cs: "Vložil/a", en: "Added by" },
  { key: "billsPage.colExported", cs: "Exportováno", en: "Exported" },
  { key: "billsPage.paidYes", cs: "Proplaceno", en: "Paid out" },
  { key: "billsPage.paidNo", cs: "Neproplaceno", en: "Not paid out" },
  { key: "billsPage.exportedYes", cs: "Ano", en: "Yes" },
  { key: "billsPage.exportedNo", cs: "Ne", en: "No" },
  { key: "billsPage.payerEventShort", cs: "Akce", en: "Event" },

  // -- Part 12: move to another event ---------------------------------------------------
  { key: "billModal.error.target_event_closed", cs: "Cílová akce je uzavřená, účtenky do ní nelze přesunout.", en: "The target event is closed; bills cannot be moved into it." },
  { key: "billModal.error.target_no_access", cs: "Do cílové akce nemáte přístup k účtenkám.", en: "You do not have bills access to the target event." },
  { key: "billsPage.bulkErrTargetClosed", cs: "{filename}: cílová akce je uzavřená.", en: "{filename}: the target event is closed." },
  { key: "billsPage.bulkErrTargetNoAccess", cs: "{filename}: do cílové akce nemáte přístup k účtenkám.", en: "{filename}: you have no bills access to the target event." },

  // -- Part 15: hidden controls, unsaved changes ------------------------------------------
  { key: "billModal.splitRemaining", cs: "Zbývá rozdělit: {amount}", en: "Left to assign: {amount}" },
  { key: "billModal.removeSplit", cs: "Odebrat toto rozdělení", en: "Remove this split" },
  { key: "billModal.unsavedConfirm", cs: "Máte neuložené změny. Opravdu odejít bez uložení?", en: "You have unsaved changes. Leave without saving?" },
  { key: "billModal.leaveWithoutSaving", cs: "Odejít bez uložení", en: "Leave without saving" },

  // -- Part 13: error codes used through dynamic keys (found by scripts/audit-translations.ts) ----
  { key: "authors.error.admin_only", cs: "Tuto akci může provést jen administrátor.", en: "Only an administrator can do this." },
  { key: "authors.error.bank_incomplete", cs: "Číslo účtu a kód banky musí být vyplněny společně.", en: "Account number and bank code must be filled in together." },
  { key: "authors.error.name_required", cs: "Vyplňte jméno plátce.", en: "Enter the payer's name." },
  { key: "billModal.error.not_found", cs: "Účtenka nebyla nalezena.", en: "Bill not found." },
  { key: "billModal.error.split_mismatch", cs: "Součet rozdělení neodpovídá částce účtenky.", en: "The split amounts do not add up to the bill total." },
  { key: "billModal.error.no_file", cs: "K účtence není přiložen soubor.", en: "This bill has no file attached." },
  { key: "billModal.error.duplicate_after_edit", cs: "Po úpravě by byla účtenka duplicitní s jinou.", en: "After this edit the bill would duplicate another one." },
  { key: "billModal.error.no_original", cs: "Původní obrázek není k dispozici.", en: "The original image is not available." },
  { key: "billModal.error.target_event_id_required", cs: "Vyberte cílovou akci.", en: "Choose a target event." },
  { key: "billModal.error.payer_not_in_event", cs: "Plátce není v této akci. Přidejte ho na stránce Plátci.", en: "This payer is not in the event. Add them on the Payers page." },
  { key: "billModal.error.already_approved", cs: "Účtenka je již schválená.", en: "The bill is already approved." },
  { key: "billModal.error.missing_fields", cs: "Chybí povinná pole.", en: "Required fields are missing." },
  { key: "billModal.error.invalid_pdf", cs: "Soubor PDF je poškozený nebo nečitelný.", en: "The PDF file is damaged or unreadable." },
  { key: "billModal.error.module_access_denied", cs: "Nemáte přístup k modulu účtenek.", en: "You do not have access to the bills module." },
  { key: "imageEditor.error.not_found", cs: "Účtenka nebyla nalezena.", en: "Bill not found." },
  { key: "imageEditor.error.no_file", cs: "K účtence není přiložen soubor.", en: "This bill has no file attached." },

  // -- Participants/settings/Health/Mail prompt, Part 1: name/surname split -----------------
  { key: "participantsPage.firstNameLabel", cs: "Jméno", en: "First name" },
  { key: "participantsPage.lastNameLabel", cs: "Příjmení", en: "Last name" },

  // -- Participants/settings/Health/Mail prompt, Part 4: field category ---------------------
  { key: "participantFieldAdmin.categoryLabel", cs: "Kategorie", en: "Category" },
  { key: "participantFieldAdmin.showInListLabel", cs: "Zobrazit v seznamu účastníků", en: "Show in the participant list" },
  { key: "participantFieldAdmin.category.basic", cs: "Základní", en: "Basic" },
  { key: "participantFieldAdmin.category.health", cs: "Zdraví", en: "Health" },
  { key: "participantFieldAdmin.category.mail", cs: "Dokumenty a pošta", en: "Documents and mail" },
  { key: "participantFieldAdmin.category.custom", cs: "Vlastní", en: "Custom" },

  // -- Participants/settings/Health/Mail prompt, Part 2: Health working list ----------------
  { key: "healthPage.title", cs: "Zdraví", en: "Health" },
  { key: "healthPage.intro", cs: "Vyberte účastníka a založte zdravotní záznam. Úpravu jména, skupiny a dalších údajů dělejte v seznamu účastníků.", en: "Pick a participant and log a health record. Edit name, group and other core data in the participant list." },
  { key: "healthPage.colIncidents", cs: "Záznamy", en: "Records" },
  { key: "healthPage.colMeds", cs: "Léky dnes", en: "Meds today" },
  { key: "healthPage.openInRosterLink", cs: "Otevřít v seznamu účastníků", en: "Open in the participant list" },
  { key: "healthPage.incidentTooltip", cs: "Poslední záznam: {date}", en: "Last record: {date}" },
  { key: "healthPage.medsTooltip", cs: "Má aktivní plán léků", en: "Has an active medication plan" },

  // -- Participants/settings/Health/Mail prompt, Part 2: Mail working list ------------------
  { key: "mailParticipantsPage.intro", cs: "Označte, které dokumenty od koho dorazily. Úpravu jména, skupiny a dalších údajů dělejte v seznamu účastníků.", en: "Mark which documents have arrived from whom. Edit name, group and other core data in the participant list." },
  { key: "mailParticipantsPage.undoButton", cs: "Vrátit zpět", en: "Undo" },
  { key: "mailParticipantsPage.undoToastMarkedReceived", cs: "Označeno jako doručeno.", en: "Marked as received." },
  { key: "mailParticipantsPage.undoToastMarkedMissing", cs: "Označení „doručeno“ zrušeno.", en: "The “received” mark was removed." },
  { key: "participantsPage.contactEmailLabel", cs: "Kontaktní e-mail", en: "Contact e-mail" },
  { key: "mailActionLogModal.action.document_marked", cs: "označen dokument jako doručený", en: "document marked as received" },
  { key: "mailActionLogModal.action.document_unmarked", cs: "zrušeno označení dokumentu jako doručený", en: "document's received mark removed" },

  // -- Participants/settings/Health/Mail prompt, Part 2: central roster edit panel ----------
  { key: "participantDetail.sectionBasics", cs: "Základní údaje", en: "Basic details" },
  { key: "participantDetail.sectionCustomFields", cs: "Údaje", en: "Details" },
  { key: "participantDetail.sectionHealthNotes", cs: "Zdravotní poznámky", en: "Health notes" },
  { key: "participantDetail.guardianPhoneLabel", cs: "Telefon", en: "Phone" },
  { key: "participantDetail.guardianReceivesLabel", cs: "Dostává e-maily", en: "Receives e-mails" },
  { key: "participantDetail.confirmDeleteGuardian", cs: "Opravdu odstranit tohoto zákonného zástupce?", en: "Remove this guardian?" },
  { key: "participantsPage.acceptImmediatelyLabel", cs: "Přijmout hned", en: "Accept immediately" },

  // -- Participants/settings/Health/Mail prompt, Part 3: medications ------------------------
  { key: "listTemplateAdmin.syncAdded", cs: "Načteno položek: {count}.", en: "Items loaded: {count}." },
  { key: "listTemplateAdmin.syncNothing", cs: "V šablonách organizace zatím nic není – přidejte je v Šablony → Zdraví.", en: "There's nothing in the organization templates yet – add some in Templates → Health." },
  { key: "medPlansSection.reportedLabel", cs: "Léky uvedené v přihlášce", en: "Medication reported at registration" },
  { key: "medPlansSection.convertToPlanButton", cs: "Převést na plán", en: "Convert to plan" },

  // -- Participants/settings/Health/Mail prompt, Part 11-I/E: documents/variables -----------
  { key: "templateCheck.emptyValue", cs: "prázdná hodnota", en: "empty value" },

  // -- Participants/settings/Health/Mail prompt, Part 5/10: event settings restructure ------
  { key: "eventSettings.tabAkce", cs: "Akce", en: "Event" },
  { key: "eventSettings.tabPripojeni", cs: "Připojení", en: "Connections" },
  { key: "eventSettings.tabUctenky", cs: "Účtenky", en: "Bills" },
  { key: "eventDetail.registrationDeadlineLabel", cs: "Termín odpovědi rodičů (nepovinné)", en: "Parent response deadline (optional)" },
  { key: "eventDetail.checklistTitle", cs: "Akce je připravená: {done} / {total}", en: "Event readiness: {done} / {total}" },
  { key: "eventDetail.checklistDrive", cs: "Složka na Disku připojena", en: "Drive folder connected" },
  { key: "eventDetail.checklistMailbox", cs: "Schránka připojena", en: "Mailbox connected" },
  { key: "eventDetail.checklistCategories", cs: "Kategorie účtenek", en: "Bill categories" },
  { key: "eventDetail.checklistDocumentTypes", cs: "Typy dokumentů", en: "Document types" },
  { key: "eventDetail.checklistDeadline", cs: "Termín odpovědi rodičů", en: "Parent response deadline" },
  { key: "accessTab.moduleOn", cs: "Zapnuto", en: "On" },
  { key: "accessTab.moduleOff", cs: "Vypnuto", en: "Off" },
  { key: "accessTab.modulesHelp", cs: "Zapněte jen to, co akce používá. Vypnutý modul zmizí z menu a jeho pole se nezobrazují, data zůstanou zachována.", en: "Turn on only what this event uses. A disabled module disappears from the menu and its fields stop showing, but its data is kept." },
  { key: "accessTab.usersHelp", cs: "Určuje, kdo v této akci vidí které moduly. Administrátor vidí vše vždy.", en: "Decides who sees which modules in this event. An administrator always sees everything." },
  { key: "billsPage.uploadButton", cs: "Nahrát účtenky", en: "Upload bills" },

  // -- Participants/settings/Health/Mail prompt, Part 6: import -----------------------------
  { key: "participantImportPage.error.name_looks_like_email", cs: "jméno vypadá jako e-mail — zkontrolujte mapování sloupců", en: "name looks like an e-mail address — check the column mapping" },
  { key: "participantImportPage.guardianCount", cs: "zástupců: {count}", en: "guardians: {count}" },

  // -- Participants/settings/Health/Mail prompt, Part 7: Health module fixes ----------------
  { key: "incidentForm.dateOutsideEventHint", cs: "Datum je mimo termín akce.", en: "The date is outside the event dates." },
  { key: "common.moreActions", cs: "Další akce", en: "More actions" },
  { key: "sendLog.colType", cs: "Typ", en: "Type" },
  { key: "sendLog.colSubject", cs: "Předmět", en: "Subject" },
  { key: "sendLog.purpose.parent_health_summary", cs: "souhrn", en: "summary" },
  { key: "sendLog.purpose.mail_helper_bulk_status_update", cs: "stav dokumentů", en: "document status" },
  { key: "sendLog.purpose.mail_helper_reply", cs: "odpověď", en: "reply" },
  { key: "sendLog.purpose.registration_acceptance", cs: "přijetí registrace", en: "registration acceptance" },
  { key: "sendLog.purpose.participant_open_email", cs: "e-mail", en: "e-mail" },
  { key: "medGridPage.outsideEventHint", cs: "Dnes je mimo termín akce – zobrazena celá akce.", en: "Today is outside the event dates – showing the whole event instead." },
  { key: "pdfExport.modeLabel", cs: "Typ výtisku", en: "Print type" },
  { key: "pdfExport.formatLabel", cs: "Formát papíru", en: "Paper format" },

  // -- Participants/settings/Health/Mail prompt, Part 8/11-B: Mail inbox --------------------
  { key: "mailPage.backLink", cs: "Akce", en: "Event" },
  { key: "mailDetail.executedSummary", cs: "E-mail byl zpracován.", en: "The e-mail was processed." },
  { key: "mailDetail.deletedSummary", cs: "E-mail byl smazán.", en: "The e-mail was deleted." },
  { key: "mailDetail.guardianEmailDetectedHint", cs: "Odesílatel je zákonný zástupce: {name}", en: "Sender is a guardian of: {name}" },
  { key: "bulkStatusModal.colRecipients", cs: "Příjemci", en: "Recipients" },
  { key: "bulkStatusModal.noRecipient", cs: "bez příjemce", en: "no recipient" },
  { key: "bulkStatusModal.noRecipientHint", cs: "Žádný zákonný zástupce s platným e-mailem, který má dostávat e-maily.", en: "No guardian with a valid e-mail flagged to receive e-mails." },
  { key: "eventDetail.signedAsLabel", cs: "E-maily, které odešlete, budou podepsané jako: {name}.", en: "E-mails you send will be signed as: {name}." },
  { key: "eventDetail.signedAsChangeLink", cs: "Změnit v osobním nastavení", en: "Change in personal settings" },

  // -- Participants/settings/Health/Mail prompt, Part 11-C/D: document counters/visibility --
  { key: "participantDetail.documentsTitle", cs: "Dokumenty", en: "Documents" },
  { key: "participantDetail.documentsEmpty", cs: "Zatím žádné doručené dokumenty.", en: "No documents received yet." },
  { key: "participantDetail.documentsFileCount", cs: "{name} — počet souborů: {count}", en: "{name} — file count: {count}" },
  { key: "participantDetail.documentsOpenInDrive", cs: "Otevřít na Disku", en: "Open in Drive" },
  { key: "participantDetail.documentsVia.email", cs: "z e-mailu", en: "from e-mail" },
  { key: "participantDetail.documentsVia.manual", cs: "ručně označeno", en: "marked manually" },

  // -- Participants/settings/Health/Mail prompt, Part 11-G: styled file input in mail dialog --
  { key: "composeEmailModal.noFileChosen", cs: "Žádný soubor nevybrán", en: "No file chosen" },

  // -- Participants/settings/Health/Mail prompt, Part 11-G: "missing translations" filter --
  { key: "translationsPage.missingOnlyLabel", cs: "Jen chybějící překlady", en: "Missing translations only" },

  // -- Participants/settings/Health/Mail prompt, Part 11-F: body map hint + remove-mark button --
  { key: "bodyMap.hint", cs: "Klepnutím na siluetu označte místo.", en: "Tap the silhouette to mark the spot." },
  { key: "bodyMap.remove", cs: "Odebrat značku", en: "Remove mark" },

  // -- Participants/settings/Health/Mail prompt, Part 11-A.4: real recipient list in the accept dialog --
  { key: "composeEmailModal.noRecipientEmail", cs: "bez kontaktního e-mailu", en: "no contact e-mail" },
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  let created = 0;
  let filled = 0;
  let untouched = 0;
  // keys defined only in older seed scripts (never run against this DB) are filled too; ROWS win on clashes
  const known = new Set(ROWS.map((r) => r.key));
  const all: Row[] = [...ROWS, ...seedDefinitions().filter((d) => !known.has(d.key) && known.add(d.key))];
  for (const row of all) {
    const existing = await prisma.translation.findUnique({ where: { key: row.key } });
    if (!existing) {
      await prisma.translation.create({ data: { key: row.key, cs: row.cs, en: row.en } });
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
  console.log(`seed-missing-translations: created ${created}, filled empty ${filled}, left as is ${untouched} (of ${all.length})`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}
