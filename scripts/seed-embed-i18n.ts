// Embedding the registration form / parent portal into an organization's website, and the
// public pages' appearance (docs/embed-design.md).
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    // Veřejné adresy
    { key: "embed.originsLabel", cs: "Weby, které smějí stránku vložit", en: "Websites allowed to embed the page" },
    { key: "embed.originsHelp", cs: "Např. https://www.zare.cz. Jen tyto weby mohou stránku zobrazit v rámečku (iframe).", en: "E.g. https://www.zare.cz. Only these websites can show the page in a frame (iframe)." },
    { key: "embed.pageLabel", cs: "Stránka portálu na webu organizace", en: "Portal page on the organization's website" },
    { key: "embed.pageHelp", cs: "Když je vyplněno, odkazy do portálu v e-mailech vedou na tuto stránku.", en: "When filled in, portal links in e-mails lead to this page." },
    { key: "embed.originsShort", cs: "Smí vložit", en: "May embed" },
    { key: "embed.pageShort", cs: "Stránka portálu", en: "Portal page" },
    { key: "embed.nobody", cs: "žádný web", en: "no website" },
    { key: "connections.error_bad_origin", cs: "Web zadejte jako https://adresa (bez cesty, bez *), jeden na řádek.", en: "Enter each website as https://address (no path, no *), one per line." },
    { key: "connections.error_bad_embed_page", cs: "Stránka portálu musí být celá adresa https://… bez #.", en: "The portal page must be a full https://… address without #." },
    { key: "connections.error_embed_page_origin", cs: "Web stránky portálu musí být mezi weby, které smějí stránku vložit.", en: "The portal page's website must be among the websites allowed to embed." },
    // Vložit na web
    { key: "embed.formButton", cs: "Vložit na web", en: "Embed on a website" },
    { key: "embed.portalButton", cs: "Vložit portál na web", en: "Embed the portal on a website" },
    { key: "embed.noOrigins", cs: "Stránku zatím nesmí vložit žádný web – požádejte administrátora aplikace o přidání adresy vašeho webu.", en: "No website may embed the page yet – ask the application administrator to add your website's address." },
    { key: "embed.allowedOrigins", cs: "Smí vložit: {origins}", en: "May embed: {origins}" },
    { key: "embed.preview", cs: "Náhled", en: "Preview" },
    { key: "embed.howTitle", cs: "Jak to vložit", en: "How to embed it" },
    { key: "embed.howWordpress", cs: "WordPress: přidejte na stránku blok „Vlastní HTML“ a vložte do něj kód.", en: "WordPress: add a “Custom HTML” block to the page and paste the code." },
    { key: "embed.howJoomla", cs: "Joomla: modul „Vlastní“ nebo článek s editorem „Žádný“; v Globální konfiguraci -> Filtry textu povolte pro svou skupinu iframe a script.", en: "Joomla: a “Custom” module or an article with the “None” editor; in Global Configuration -> Text Filters allow iframe and script for your group." },
    { key: "publicLanding.embedText", cs: "Rodičovský portál otevřete přes odkaz z e-mailu, který vám přišel.", en: "Open the parent portal through the link in the e-mail you received." },
    // Vzhled veřejných stránek
    { key: "nav.appearance", cs: "Vzhled veřejných stránek", en: "Public pages appearance" },
    { key: "appearance.title", cs: "Vzhled veřejných stránek", en: "Public pages appearance" },
    { key: "appearance.subtitle", cs: "Písmo a velikosti přihlášky, rodičovského portálu a úvodní stránky – i když jsou vložené na webu organizace. Aplikace samotná se nemění.", en: "Font and sizes of the registration form, the parent portal and the landing page – also when embedded in the organization's website. The app itself doesn't change." },
    { key: "appearance.adminOnly", cs: "Jen pro správce organizace.", en: "Organization admins only." },
    { key: "appearance.default", cs: "Výchozí", en: "Default" },
    { key: "appearance.bodyFont", cs: "Písmo textu", en: "Body font" },
    { key: "appearance.headingFont", cs: "Písmo nadpisů", en: "Heading font" },
    { key: "appearance.baseSize", cs: "Základní velikost písma", en: "Base font size" },
    { key: "appearance.likeZare", cs: "jako zare.cz", en: "like zare.cz" },
    { key: "appearance.headingScale", cs: "Velikost nadpisů", en: "Heading size" },
    { key: "appearance.scale.compact", cs: "Menší", en: "Smaller" },
    { key: "appearance.scale.normal", cs: "Běžná", en: "Normal" },
    { key: "appearance.scale.large", cs: "Větší", en: "Larger" },
    { key: "appearance.lineHeight", cs: "Řádkování", en: "Line height" },
    { key: "appearance.line.compact", cs: "Husté", en: "Compact" },
    { key: "appearance.line.normal", cs: "Běžné", en: "Normal" },
    { key: "appearance.line.relaxed", cs: "Volné", en: "Relaxed" },
    { key: "appearance.reset", cs: "Obnovit výchozí", en: "Reset to default" },
    { key: "appearance.saved", cs: "Uloženo.", en: "Saved." },
    { key: "appearance.failed", cs: "Uložení se nepovedlo.", en: "Saving failed." },
    { key: "appearance.preview", cs: "Náhled", en: "Preview" },
    { key: "appearance.sampleOrg", cs: "Turistický oddíl Sluníčko", en: "Sunshine hiking club" },
    { key: "appearance.sampleEvent", cs: "Letní tábor 2027", en: "Summer camp 2027" },
    { key: "appearance.sampleText", cs: "Přihlášku vyplňte do konce dubna. Na tábor se těšíme!", en: "Fill in the registration by the end of April. See you at camp!" },
    { key: "appearance.sampleSection", cs: "Účastník", en: "Participant" },
    { key: "appearance.sampleField", cs: "Jméno a příjmení", en: "Full name" },
    { key: "appearance.sampleButton", cs: "Odeslat přihlášku", en: "Send registration" },
    { key: "appearance.sampleCard", cs: "Letní tábor 2027 – přihláška přijata", en: "Summer camp 2027 – registration accepted" },
    { key: "appearance.sampleCardText", cs: "Platba: 4 500 Kč, variabilní symbol 271100017.", en: "Payment: 4 500 CZK, variable symbol 271100017." },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} embed keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
