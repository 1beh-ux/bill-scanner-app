// Organizations step 3: super-admin screens (Aplikace section, Organizace page,
// organization switcher + strip), read-only Připojení, admin role rules.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    { key: "nav.sectionApp", cs: "Aplikace", en: "Application" },
    { key: "nav.organizations", cs: "Organizace", en: "Organizations" },
    { key: "nav.publicHosts", cs: "Veřejné adresy", en: "Public addresses" },
    { key: "orgs.switcherLabel", cs: "Organizace", en: "Organization" },
    { key: "orgs.actingStrip", cs: "Pracujete v organizaci {name}", en: "You are working in {name}" },
    { key: "orgs.backHome", cs: "Zpět do {name}", en: "Back to {name}" },
    { key: "orgs.superAdminOnly", cs: "Jen pro správce aplikace.", en: "Application admins only." },
    { key: "orgs.title", cs: "Organizace", en: "Organizations" },
    { key: "orgs.subtitle", cs: "Všechny organizace v aplikaci. „Přepnout“ otevře aplikaci tak, jak ji vidí správce dané organizace.", en: "Every organization in the app. “Switch” opens the app as that organization's admin sees it." },
    { key: "orgs.new", cs: "Nová organizace", en: "New organization" },
    { key: "orgs.create", cs: "Založit organizaci", en: "Create organization" },
    { key: "orgs.field_name", cs: "Název", en: "Name" },
    { key: "orgs.field_shortName", cs: "Zkratka", en: "Short name" },
    { key: "orgs.field_contactEmail", cs: "Kontaktní e-mail (nepovinný)", en: "Contact e-mail (optional)" },
    { key: "orgs.field_adminEmail", cs: "E-mail", en: "E-mail" },
    { key: "orgs.field_adminName", cs: "Jméno", en: "Name" },
    { key: "orgs.firstAdmin", cs: "První správce organizace", en: "The organization's first admin" },
    { key: "orgs.noTemplatesHint", cs: "Nová organizace začíná bez šablon (kategorie, seznamy, e-maily, pole účastníků). Kopírování ze šablon aplikace přijde v dalším kroku.", en: "A new organization starts without templates (categories, lists, e-mails, participant fields). Copying from app templates comes in a later step." },
    { key: "orgs.colName", cs: "Název", en: "Name" },
    { key: "orgs.colShort", cs: "Zkratka", en: "Short name" },
    { key: "orgs.colContact", cs: "Kontaktní e-mail", en: "Contact e-mail" },
    { key: "orgs.colAdmins", cs: "Správci", en: "Admins" },
    { key: "orgs.colUsers", cs: "Uživatelé", en: "Users" },
    { key: "orgs.colEvents", cs: "Akce", en: "Events" },
    { key: "orgs.colHosts", cs: "Veřejné adresy", en: "Public addresses" },
    { key: "orgs.colActive", cs: "Aktivní", en: "Active" },
    { key: "orgs.home", cs: "vaše", en: "yours" },
    { key: "orgs.acting", cs: "právě v ní pracujete", en: "working in it now" },
    { key: "orgs.switch", cs: "Přepnout", en: "Switch" },
    { key: "orgs.deactivate", cs: "Deaktivovat", en: "Deactivate" },
    { key: "orgs.activate", cs: "Aktivovat", en: "Activate" },
    { key: "orgs.deactivateConfirm", cs: "Deaktivovat organizaci {name}? Její uživatelé se nepřihlásí a její veřejné adresy přestanou fungovat. Data zůstanou a organizaci lze znovu aktivovat.", en: "Deactivate {name}? Its users can't sign in and its public addresses stop working. The data stays and the organization can be activated again." },
    { key: "orgs.activateConfirm", cs: "Znovu aktivovat organizaci {name}?", en: "Activate {name} again?" },
    { key: "orgs.errorEmailTaken", cs: "Tento e-mail už má účet v organizaci {org}.", en: "This e-mail already has an account in {org}." },
    { key: "orgs.error_missing_fields", cs: "Vyplňte název, zkratku a jméno správce.", en: "Fill in the name, short name and the admin's name." },
    { key: "orgs.error_bad_email", cs: "Neplatný e-mail.", en: "Invalid e-mail." },
    { key: "orgs.error_cannot_deactivate_home", cs: "Vlastní organizaci deaktivovat nelze.", en: "You can't deactivate your own organization." },
    { key: "orgs.error_super_admin_only", cs: "Jen pro správce aplikace.", en: "Application admins only." },
    { key: "orgs.error_not_found", cs: "Organizace už neexistuje.", en: "The organization no longer exists." },
    { key: "orgs.error_failed", cs: "Akce se nepodařila.", en: "That didn't work." },
    { key: "connections.colOrganization", cs: "Organizace", en: "Organization" },
    { key: "connections.appSubtitle", cs: "Veřejné adresy všech organizací. Adresa patří jedné organizaci a zobrazuje jen její přihlášky a portál.", en: "Every organization's public addresses. An address belongs to one organization and shows only its registrations and portal." },
    { key: "connections.helpReadOnly", cs: "Novou adresu nebo změnu nastaví správce aplikace.", en: "New addresses and changes are set up by the application admin." },
    { key: "connections.error_bad_organization", cs: "Vyberte aktivní organizaci.", en: "Pick an active organization." },
    // Step 4: app templates.
    { key: "nav.appTemplates", cs: "Šablony aplikace", en: "App templates" },
    { key: "appTemplates.intro", cs: "Šablony, které dostane každá nová organizace jako kopii. Organizace si z nich mohou položky obnovit nebo načíst nové; úprava tady žádnou organizaci sama nezmění.", en: "Templates every new organization gets as a copy. Organizations can restore items from them or load new ones; a change here doesn't change any organization by itself." },
    { key: "orgs.templatesCopiedHint", cs: "Nová organizace dostane kopie všech aktivních šablon aplikace (Aplikace → Šablony aplikace).", en: "A new organization gets copies of every active app template (Application → App templates)." },
    { key: "appSync.title", cs: "Šablony aplikace:", en: "App templates:" },
    { key: "appSync.summary", cs: "výchozí {def} · upraveno {mod} · vlastní {own}", en: "default {def} · modified {mod} · own {own}" },
    { key: "appSync.show", cs: "Zobrazit stav", en: "Show status" },
    { key: "appSync.hide", cs: "Skrýt", en: "Hide" },
    { key: "appSync.pull", cs: "Načíst nové z aplikace", en: "Load new from the app" },
    { key: "appSync.pulled", cs: "Načteno {count} položek.", en: "Loaded {count} items." },
    { key: "appSync.nothingNew", cs: "Nic nového.", en: "Nothing new." },
    { key: "appSync.status.default", cs: "Výchozí", en: "Default" },
    { key: "appSync.status.modified", cs: "Upraveno", en: "Modified" },
    { key: "appSync.status.custom", cs: "Vlastní", en: "Own" },
    { key: "appSync.compare", cs: "Porovnat", en: "Compare" },
    { key: "appSync.hideCompare", cs: "Skrýt porovnání", en: "Hide comparison" },
    { key: "appSync.restore", cs: "Obnovit z aplikace", en: "Restore from the app" },
    { key: "appSync.restoreConfirm", cs: "Obnovit „{name}“ podle šablony aplikace? Vaše úpravy této položky se přepíšou.", en: "Restore “{name}” from the app template? Your changes to this item are overwritten." },
    { key: "appSync.colField", cs: "Pole", en: "Field" },
    { key: "appSync.colOrg", cs: "Organizace", en: "Organization" },
    { key: "appSync.colApp", cs: "Aplikace", en: "App" },
    // Step 5: public pages show their organization.
    { key: "portal.contact", cs: "Kontakt:", en: "Contact:" },
    { key: "usersPage.error.last_admin", cs: "Organizace musí mít aspoň jednoho aktivního správce.", en: "The organization needs at least one active admin." },
    { key: "usersPage.error.super_admin_only", cs: "Roli správce může přidělit nebo odebrat jen správce aplikace.", en: "Only the application admin can grant or remove the admin role." },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} organization keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
