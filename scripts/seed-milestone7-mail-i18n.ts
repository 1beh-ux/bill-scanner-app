import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const rows: { key: string; cs: string; en: string }[] = [
    { key: "common.close", cs: "Zavřít", en: "Close" },

    { key: "healthTemplatesPage.tabEmail", cs: "E-mail", en: "Email" },

    { key: "emailTemplateAdmin.errorLoadFailed", cs: "Načtení šablony se nezdařilo.", en: "Failed to load the template." },
    { key: "emailTemplateAdmin.errorSaveFailed", cs: "Uložení se nezdařilo.", en: "Failed to save." },
    { key: "emailTemplateAdmin.revertToDefault", cs: "Vrátit na výchozí", en: "Revert to default" },
    { key: "emailTemplateAdmin.usingOrgDefault", cs: "Používá se výchozí šablona organizace.", en: "Using the organization's default template." },
    { key: "emailTemplateAdmin.subjectLabel", cs: "Předmět", en: "Subject" },
    { key: "emailTemplateAdmin.bodyLabel", cs: "Text zprávy", en: "Body" },
    { key: "emailTemplateAdmin.previewTitle", cs: "Náhled", en: "Preview" },

    { key: "senderEmailField.title", cs: "Odesílatel e-mailů", en: "Sender email" },
    { key: "senderEmailField.hint", cs: "Schránka Google Workspace, ze které se odešlou souhrny rodičům pro tuto akci. Vlastník schránky musí jednorázově povolit přístup. Stejnou připojenou schránku lze použít pro více akcí.", en: "The Google Workspace mailbox summaries for this event are sent from. The mailbox owner must grant access once. The same connected mailbox can be reused across multiple events." },
    { key: "senderEmailField.notConfiguredWarning", cs: "Bez nastavené adresy nelze rodičům odesílat souhrny.", en: "Summaries can't be sent to guardians until an address is set." },
    { key: "senderEmailField.setButNotConnectedWarning", cs: "Adresa {email} není propojená — je potřeba ji znovu připojit.", en: "{email} isn't connected — it needs to be reconnected." },
    { key: "senderEmailField.connectedStatus", cs: "Propojeno: {email}", en: "Connected: {email}" },
    { key: "senderEmailField.pickPlaceholder", cs: "Vybrat připojenou schránku…", en: "Pick a connected mailbox…" },
    { key: "senderEmailField.connectNewButton", cs: "+ Připojit novou schránku", en: "+ Connect new mailbox" },
    { key: "senderEmailField.connectSuccessBanner", cs: "Schránka byla úspěšně připojena a nastavena jako odesílatel pro tuto akci.", en: "Mailbox connected successfully and set as this event's sender." },
    { key: "senderEmailField.connectErrorBanner", cs: "Propojení schránky se nezdařilo. Zkuste to prosím znovu.", en: "Connecting the mailbox failed. Please try again." },
    { key: "senderEmailField.errorLoadFailed", cs: "Načtení se nezdařilo.", en: "Failed to load." },
    { key: "senderEmailField.errorSaveFailed", cs: "Uložení se nezdařilo.", en: "Failed to save." },
    { key: "senderEmailField.saved", cs: "Uloženo.", en: "Saved." },

    { key: "participantDetail.downloadPdfButton", cs: "Stáhnout PDF", en: "Download PDF" },

    { key: "sendSummary.sendButtonShort", cs: "Odeslat souhrn rodičům", en: "Send summary to guardians" },
    { key: "sendSummary.title", cs: "Odeslat souhrn rodičům", en: "Send summary to guardians" },
    { key: "sendSummary.errorLoadFailed", cs: "Načtení náhledu se nezdařilo.", en: "Failed to load the preview." },
    { key: "sendSummary.errorSendFailed", cs: "Odeslání se nezdařilo.", en: "Sending failed." },
    { key: "sendSummary.noRecipients", cs: "Žádný zákonný zástupce nemá povolen příjem zpráv.", en: "No guardian has communications enabled." },
    { key: "sendSummary.recipientsLabel", cs: "Příjemci", en: "Recipients" },
    { key: "sendSummary.subjectLabel", cs: "Předmět", en: "Subject" },
    { key: "sendSummary.sendButton", cs: "Odeslat", en: "Send" },
    { key: "sendSummary.resultMessage", cs: "Odesláno: {sent} · nezdařilo se: {failed}", en: "Sent: {sent} · failed: {failed}" },

    { key: "sendLog.title", cs: "Odeslané e-maily", en: "Sent emails" },
    { key: "sendLog.empty", cs: "Zatím žádné odeslané e-maily.", en: "No emails sent yet." },
    { key: "sendLog.colGuardian", cs: "Zákonný zástupce", en: "Guardian" },
    { key: "sendLog.colSentAt", cs: "Odesláno", en: "Sent at" },
    { key: "sendLog.colStatus", cs: "Stav", en: "Status" },
    { key: "sendLog.statusSent", cs: "Odesláno", en: "Sent" },
    { key: "sendLog.statusFailed", cs: "Nezdařilo se", en: "Failed" },
    { key: "sendLog.resendButton", cs: "Odeslat znovu", en: "Resend" },

    { key: "bulkSendSummaries.entryPoint", cs: "Odeslat souhrny všem rodičům", en: "Send summaries to all guardians" },
    { key: "bulkSendSummaries.title", cs: "Odeslat souhrny všem rodičům", en: "Send summaries to all guardians" },
    { key: "bulkSendSummaries.tabSend", cs: "Odeslat", en: "Send" },
    { key: "bulkSendSummaries.selectAll", cs: "Vybrat vše", en: "Select all" },
    { key: "bulkSendSummaries.confirm", cs: "Opravdu odeslat souhrn {count} rodičům? Tato akce se nedá vzít zpět.", en: "Really send the summary to {count} guardians? This cannot be undone." },
    { key: "bulkSendSummaries.sendButton", cs: "Odeslat ({count})", en: "Send ({count})" },
    { key: "bulkSendSummaries.resultInline", cs: "odesláno: {sent} · nezdařilo se: {failed}", en: "sent: {sent} · failed: {failed}" },
  ];

  for (const row of rows) {
    await prisma.translation.upsert({
      where: { key: row.key },
      update: { cs: row.cs, en: row.en },
      create: row,
    });
    console.log(`  ok: ${row.key}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
