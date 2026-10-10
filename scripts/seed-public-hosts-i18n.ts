// Public hosts: Organizace -> Připojení -> Veřejné adresy, the landing page on a
// public host, the hint in the public registration settings (docs/custom-domain.md).
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    { key: "nav.connections", cs: "Připojení", en: "Connections" },
    { key: "connections.title", cs: "Připojení", en: "Connections" },
    { key: "connections.subtitle", cs: "Adresy, na kterých aplikace běží mimo administraci.", en: "Addresses the app runs on outside the admin app." },
    { key: "connections.hostsTitle", cs: "Veřejné adresy", en: "Public addresses" },
    { key: "connections.hostsIntro", cs: "Na veřejné adrese je jen přihláška a/nebo rodičovský portál, nic dalšího. Odkazy v e-mailech a dokumentech použijí výchozí adresu; přihláška akce má přednost adresu přímo pro tuto akci.", en: "A public address serves only the registration page and/or the parent portal, nothing else. Links in e-mails and documents use the default address; an event's registration prefers an address set for that event." },
    { key: "connections.add", cs: "Přidat adresu", en: "Add address" },
    { key: "connections.colHost", cs: "Adresa", en: "Address" },
    { key: "connections.colPurpose", cs: "Účel", en: "Purpose" },
    { key: "connections.colEvent", cs: "Akce", en: "Event" },
    { key: "connections.colDefault", cs: "Výchozí", en: "Default" },
    { key: "connections.colActive", cs: "Aktivní", en: "Active" },
    { key: "connections.purposeRegistration", cs: "Přihlášky", en: "Registrations" },
    { key: "connections.purposePortal", cs: "Rodičovský portál", en: "Parent portal" },
    { key: "connections.purposeBoth", cs: "Obojí", en: "Both" },
    { key: "connections.allEvents", cs: "Všechny akce", en: "All events" },
    { key: "connections.portalGlobalHint", cs: "Portál je rodinný odkaz napříč akcemi, proto platí pro všechny akce.", en: "The portal is a family link across events, so it applies to every event." },
    { key: "connections.default", cs: "Výchozí adresa pro tento účel", en: "Default address for this purpose" },
    { key: "connections.defaultHint", cs: "Použije se v nových odkazech. Staré odkazy na tabornik.online se na ni přesměrují. Jen jedna aktivní výchozí adresa na účel.", en: "Used in new links. Old tabornik.online links redirect to it. Only one active default per purpose." },
    { key: "connections.empty", cs: "Zatím žádné veřejné adresy — přihláška i portál běží na adrese aplikace.", en: "No public addresses yet — registration and portal run on the app's address." },
    { key: "connections.yes", cs: "ano", en: "yes" },
    { key: "connections.no", cs: "ne", en: "no" },
    { key: "connections.verify", cs: "Ověřit", en: "Verify" },
    { key: "connections.verifyRunning", cs: "Ověřuji…", en: "Checking…" },
    { key: "connections.verify_ok", cs: "OK — adresa vede na tabornik a stránka odpovídá.", en: "OK — the address points to tabornik and the page answers." },
    { key: "connections.verify_dns", cs: "DNS nevede na tabornik. Zkontrolujte záznam CNAME u správce domény (změna se může projevit až za několik hodin).", en: "DNS doesn't point to tabornik. Check the CNAME record at the domain's DNS (a change can take a few hours)." },
    { key: "connections.verify_tls", cs: "Certifikát chybí / TLS chyba. Administrátor musí pro adresu přidat certifikát v Google Cloud (vydání trvá až hodinu).", en: "Certificate missing / TLS error. An admin has to add a certificate for the address in Google Cloud (issuing takes up to an hour)." },
    { key: "connections.verify_page", cs: "Stránka neodpovídá. DNS i certifikát jsou v pořádku, ale adresa nevrací úvodní stránku.", en: "The page doesn't answer. DNS and certificate are fine, but the address doesn't return the landing page." },
    { key: "connections.verify_no_lb_ip", cs: "Ověření není nastavené (chybí LB_IP na serveru).", en: "Verification isn't configured (LB_IP missing on the server)." },
    { key: "connections.commands", cs: "Příkazy", en: "Commands" },
    { key: "connections.copy", cs: "Kopírovat příkazy", en: "Copy commands" },
    { key: "connections.copied", cs: "Zkopírováno", en: "Copied" },
    { key: "connections.edit", cs: "Upravit", en: "Edit" },
    { key: "connections.deactivate", cs: "Deaktivovat", en: "Deactivate" },
    { key: "connections.activate", cs: "Aktivovat", en: "Activate" },
    { key: "connections.deactivateConfirm", cs: "Deaktivovat {host}? Adresa přestane zobrazovat přihlášky i portál a nové odkazy ji nepoužijí. Odkazy, které už rodiče dostali, na ní přestanou fungovat.", en: "Deactivate {host}? The address stops serving registrations and the portal and new links won't use it. Links parents already have stop working there." },
    { key: "connections.activateConfirm", cs: "Znovu aktivovat {host}?", en: "Activate {host} again?" },
    { key: "connections.help", cs: "U správce domény vytvořte záznam CNAME <adresa> -> public.tabornik.online. Certifikát pro novou adresu přidává administrátor v Google Cloud (tlačítko Příkazy u adresy).", en: "At the domain's DNS, create a CNAME record <address> -> public.tabornik.online. An admin adds the certificate for a new address in Google Cloud (the Commands button on the address)." },
    { key: "connections.error_bad_hostname", cs: "Neplatná adresa. Zadejte jen doménu, např. prihlasky.example.cz.", en: "Invalid address. Enter just the domain, e.g. prihlasky.example.cz." },
    { key: "connections.error_admin_hostname", cs: "Tohle je adresa samotné aplikace, nemůže být veřejná.", en: "That's the app's own address; it can't be public." },
    { key: "connections.error_bad_purpose", cs: "Vyberte účel.", en: "Pick a purpose." },
    { key: "connections.error_bad_event", cs: "Vybraná akce neexistuje.", en: "The chosen event doesn't exist." },
    { key: "connections.error_hostname_taken", cs: "Tato adresa už v seznamu je.", en: "This address is already on the list." },
    { key: "connections.error_default_taken", cs: "Pro tento účel už je jiná aktivní výchozí adresa. Nejdřív jí výchozí zrušte.", en: "Another active address is already the default for this purpose. Unset that one first." },
    { key: "connections.error_failed", cs: "Uložení se nepodařilo.", en: "Couldn't save." },
    { key: "connections.error_not_found", cs: "Adresa už neexistuje.", en: "The address no longer exists." },
    { key: "connections.error_admin_only", cs: "Jen pro administrátory.", en: "Admins only." },
    { key: "publicSettings.hostHint", cs: "Doménu odkazu určuje", en: "The link's domain is set in" },
    { key: "publicSettings.hostHintLink", cs: "Organizace → Připojení", en: "Organization → Connections" },
    { key: "portal.pageTitle", cs: "Rodičovský portál", en: "Parent portal" },
    { key: "publicNotFound.title", cs: "Stránka nenalezena", en: "Page not found" },
    { key: "publicNotFound.text", cs: "Odkaz je neplatný nebo už neplatí. Ověřte ho prosím u pořadatele akce.", en: "The link is invalid or no longer valid. Please check it with the event's organiser." },
    { key: "publicLanding.title", cs: "Přihlášky a rodičovský portál", en: "Registrations and parent portal" },
    { key: "publicLanding.text", cs: "Odkaz na přihlášku nebo na rodičovský portál dostanete od pořadatele akce, obvykle e-mailem.", en: "You get the link to the registration or the parent portal from the event's organiser, usually by e-mail." },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} public-host keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
