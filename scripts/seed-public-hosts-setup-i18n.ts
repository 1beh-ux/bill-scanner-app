// Veřejné adresy -> "Příkazy": the setup panel (Google Cloud, DNS records, message for the DNS admin). cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("connections.setupGcpTitle", "1. Google Cloud – certifikát (superadmin)", "1. Google Cloud – certificate (super-admin)"),
  r("connections.setupGcpText", "Spusťte v Cloud Shell projektu prvni-beh-filesaver, příkaz po příkazu. Krok 2 vypíše hodnotu pro první DNS záznam (řádek „data:“) – pošlete ji správci domény spolu se zprávou níže. Kroky 3 a 4 můžete spustit hned, certifikát se aktivuje sám, až budou DNS záznamy přidané.", "Run in Cloud Shell of the prvni-beh-filesaver project, one command at a time. Step 2 prints the value for the first DNS record (the “data:” line) – send it to the domain's administrator with the message below. Steps 3 and 4 can run right away; the certificate activates by itself once the DNS records exist."),
  r("connections.setupDnsTitle", "2. DNS domény {zone} – pošlete správci domény", "2. DNS of {zone} – send to the domain's administrator"),
  r("connections.setupDnsText", "Dva záznamy v DNS zóně {zone} (u registrátora nebo hostingu, kde se doména spravuje). Název je uvedený tak, jak se obvykle zadává ve formuláři DNS (bez {zone}); pod ním celé jméno.", "Two records in the {zone} DNS zone (at the registrar or host that manages the domain). The name is shown the way DNS forms usually want it (without {zone}); the full name is below it."),
  r("connections.dnsType", "Typ", "Type"),
  r("connections.dnsName", "Název (v zóně {zone})", "Name (in zone {zone})"),
  r("connections.dnsValue", "Hodnota / cíl", "Value / target"),
  r("connections.dnsAcmeNote", "První záznam (_acme-challenge) slouží jen k vydání a obnově certifikátu – nechte ho v DNS natrvalo. Hodnotu vypíše krok 2 v Google Cloud (končí na .authorize.certificatemanager.goog.).", "The first record (_acme-challenge) is only for issuing and renewing the certificate – keep it in DNS permanently. Step 2 in Google Cloud prints its value (ending in .authorize.certificatemanager.goog.)."),
  r("connections.dnsCnameNote", "Druhý záznam nasměruje adresu na aplikaci. Na stejném jméně nesmí zůstat jiný záznam (A, AAAA ani jiný CNAME). Tečka na konci hodnoty patří k zápisu; některé formuláře ji doplní samy.", "The second record points the address at the app. No other record (A, AAAA or another CNAME) may stay on the same name. The trailing dot is part of the notation; some forms add it themselves."),
  r("connections.dnsApexNote", "Hlavní doména nemůže být CNAME, proto záznam A na IP {ip}. Původní záznamy A/AAAA na tomto jméně je nutné odebrat – přestane tím fungovat dosavadní web na této adrese.", "The bare domain can't be a CNAME, hence an A record to {ip}. Existing A/AAAA records on this name must be removed – the current website at this address stops working."),
  r("connections.dnsMailLabel", "Hotová zpráva pro správce domény (doplňte hodnotu z kroku 2):", "Ready message for the domain's administrator (fill in the value from step 2):"),
  r("connections.dnsMailIntro", "Dobrý den, prosím o přidání dvou DNS záznamů do zóny {zone} pro adresu {host} (přihlášky a rodičovský portál běží v aplikaci Táborník):", "Hello, please add two DNS records to the {zone} zone for {host} (registrations and the parent portal run in the Táborník app):"),
  r("connections.dnsMailOutro", "Záznam _acme-challenge prosím ponechte natrvalo (obnova certifikátu). Na jménu adresy nesmí zůstat jiný záznam. Děkuji.", "Please keep the _acme-challenge record permanently (certificate renewal). No other record may stay on the address name. Thank you."),
  r("connections.setupVerifyTitle", "3. Ověření", "3. Verify"),
  r("connections.setupVerifyText", "Až správce záznamy přidá a certifikát je ACTIVE (poslední příkaz v kroku 1, obvykle do hodiny), stiskněte u adresy „Ověřit“. Teprve potom adresu aktivujte a případně nastavte jako výchozí – výchozí adresa se hned používá v odkazech pro rodiče.", "Once the records are added and the certificate is ACTIVE (the last command in step 1, usually within an hour), press “Ověřit” on the address. Only then activate it and, if wanted, make it the default – the default address is used in parents' links at once."),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} public-host setup keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
