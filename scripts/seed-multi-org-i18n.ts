// One person in several organizations + "Zobrazit jako" + Aplikace -> Účty + module packages (2026-11-10). cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("impersonate.button", "Zobrazit jako", "View as"),
  r("impersonate.hint", "Uvidíte aplikaci přesně tak, jak ji vidí tento uživatel – jen pro čtení, nic neuložíte.", "See the app exactly as this user sees it – read-only, nothing can be saved."),
  r("impersonate.strip", "Díváte se jako {who} v organizaci {org} – jen pro čtení", "Viewing as {who} in {org} – read-only"),
  r("impersonate.stop", "Ukončit (zpět jako {name})", "Stop (back as {name})"),
  r("impersonate.failed", "Zobrazit jako tohoto uživatele nejde.", "You can't view as this user."),
  r("usersPage.memberBadge", "člen", "member"),
  r("usersPage.memberHint", "Účet patří jiné organizaci a je sem přidaný jako člen. Jméno si spravuje sám; vypnutím ho jen odeberete z této organizace.", "The account belongs to another organization and is added here as a member. They manage their own name; turning it off only removes them from this organization."),
  r("usersPage.removeMemberConfirm", "Odebrat {name} z této organizace? Jeho účet v domovské organizaci zůstane.", "Remove {name} from this organization? Their account in their own organization stays."),
  r("nav.accounts", "Účty", "Accounts"),
  r("accounts.title", "Účty napříč organizacemi", "Accounts across organizations"),
  r("accounts.subtitle", "Všechny účty aplikace: domovská organizace a role, členství jinde. U každé organizace lze zobrazit aplikaci jako daný uživatel.", "Every account in the app: own organization and role, memberships elsewhere. For each organization you can view the app as that user."),
  r("accounts.search", "Hledat jméno, e-mail, organizaci…", "Search name, e-mail, organization…"),
  r("accounts.colOrganizations", "Organizace a role", "Organizations and roles"),
  r("accounts.superAdmin", "superadmin", "super-admin"),
  // Module packages: "Lidé na akci"
  r("accessTab.peopleGroup", "Lidé na akci", "People at the event"),
  r("accessTab.peopleGroupHelp", "Zapněte jen to, co akce potřebuje. Akce jen na účtenky nebo program nepotřebuje nic z toho.", "Turn on only what the event needs. An event for bills or a programme only needs none of these."),
  r("accessTab.moduleParticipants", "Děti (účastníci)", "Children (participants)"),
  r("accessTab.module_adults", "Dospělí na akci", "Adults at the event"),
  r("accessTab.module_registration", "Přihláška a platba", "Registration and payment"),
  r("accessTab.module_portal", "Rodičovský portál", "Parent portal"),
  r("accessTab.needsChildren", "zapne i Děti", "turns on Children too"),
  r("accessTab.adultsByKitchen", "zapnuto Kuchyní", "on because of Kitchen"),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} multi-org + module keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
