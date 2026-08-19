import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const rows: { key: string; cs: string; en: string }[] = [
    // Sidebar / nav
    { key: "nav.mail", cs: "Pošta", en: "Mail" },
    { key: "nav.sectionMail", cs: "Pošta", en: "Mail" },

    // Event settings tab
    { key: "eventSettings.tabMail", cs: "Pošta", en: "Mail" },

    // Org-wide templates tab
    { key: "templatesPage.tabMail", cs: "Pošta", en: "Mail" },

    // SenderEmailField reconnect (mail purpose)
    { key: "senderEmailField.needsReconnectWarning", cs: "Schránka {email} nemá dostatečná oprávnění pro čtení a archivaci pošty — je potřeba ji znovu připojit.", en: "The mailbox {email} doesn't have permission to read/archive mail — it needs to be reconnected." },
    { key: "senderEmailField.reconnectButton", cs: "Znovu připojit schránku", en: "Reconnect mailbox" },

    // Event settings Mail tab (sync settings + template label + inbox link)
    { key: "mailTab.bulkStatusTemplateLabel", cs: "Šablona hromadného e-mailu o stavu", en: "Bulk status-update email template" },
    { key: "mailTab.openInboxLink", cs: "Otevřít doručenou poštu →", en: "Open inbox →" },
    { key: "mailTab.syncSettingsTitle", cs: "Synchronizace", en: "Sync" },
    { key: "mailTab.syncOneWayWarning", cs: "Jednosměrná synchronizace z aplikace — úpravy na Disku nebo v listu se do aplikace nepropíšou.", en: "One-way sync from the app — changes made in Drive or the Sheet don't sync back." },
    { key: "mailTab.driveSyncEnabledLabel", cs: "Zrcadlit přijaté dokumenty na Disk", en: "Mirror received documents to Drive" },
    { key: "mailTab.statusExportEnabledLabel", cs: "Exportovat stav dokumentů do listu", en: "Export document status to a Sheet" },
    { key: "mailTab.syncNowButton", cs: "Synchronizovat nyní", en: "Sync now" },
    { key: "mailTab.syncNowFailed", cs: "Synchronizace se nezdařila.", en: "Sync failed." },
    { key: "mailTab.syncSettingsErrorSaveFailed", cs: "Uložení se nezdařilo.", en: "Failed to save." },
    { key: "mailTab.openSheetLink", cs: "Otevřít list", en: "Open sheet" },
    { key: "mailTab.lastSyncedAt", cs: "Naposledy synchronizováno: {date}", en: "Last synced: {date}" },

    // Mail page shell
    { key: "mailPage.title", cs: "Doručená pošta", en: "Inbox" },
    { key: "mailPage.bulkStatusButton", cs: "Hromadný status update", en: "Bulk status update" },
    { key: "mailPage.logsButton", cs: "Poslední akce", en: "Recent actions" },
    { key: "mailPage.mailboxConnectedBanner", cs: "Schránka byla úspěšně připojena.", en: "Mailbox connected successfully." },
    { key: "mailPage.mailboxConnectErrorBanner", cs: "Propojení schránky se nezdařilo. Zkuste to prosím znovu.", en: "Connecting the mailbox failed. Please try again." },
    { key: "mailPage.senderNotConfiguredBanner", cs: "Pro tuto akci není nastavena odesílající schránka.", en: "No sender mailbox is configured for this event." },
    { key: "mailPage.senderNotConfiguredLink", cs: "Připojit schránku", en: "Connect a mailbox" },

    // Inbox list
    { key: "mailInbox.loadButton", cs: "Načíst emaily", en: "Load emails" },
    { key: "mailInbox.sortOldest", cs: "Od nejstarších", en: "Oldest first" },
    { key: "mailInbox.sortNewest", cs: "Od nejnovějších", en: "Newest first" },
    { key: "mailInbox.selectButton", cs: "Vybrat emaily", en: "Select emails" },
    { key: "mailInbox.closeSelectButton", cs: "Zavřít výběr", en: "Close selection" },
    { key: "mailInbox.selectAllButton", cs: "Vybrat vše", en: "Select all" },
    { key: "mailInbox.clearSelectionButton", cs: "Zrušit výběr", en: "Clear selection" },
    { key: "mailInbox.bulkMoveButton", cs: "Přesunout vybrané", en: "Move selected" },
    { key: "mailInbox.bulkDeleteButton", cs: "Smazat vybrané", en: "Delete selected" },
    { key: "mailInbox.selectedCount", cs: "Vybráno: {count}", en: "Selected: {count}" },
    { key: "mailInbox.empty", cs: "Žádné emaily.", en: "No emails." },
    { key: "mailInbox.noSubject", cs: "(bez předmětu)", en: "(no subject)" },
    { key: "mailInbox.loadFailed", cs: "Načtení emailů se nezdařilo.", en: "Failed to load emails." },
    { key: "mailInbox.senderNotConfigured", cs: "Nejprve připojte odesílající schránku v nastavení akce.", en: "Connect a sender mailbox in the event's settings first." },

    // Detail panel
    { key: "mailDetail.emptyHint", cs: "Vyber email vlevo.", en: "Select an email on the left." },
    { key: "mailDetail.fromLabel", cs: "Od", en: "From" },
    { key: "mailDetail.subjectLabel", cs: "Předmět", en: "Subject" },
    { key: "mailDetail.dateLabel", cs: "Datum", en: "Date" },
    { key: "mailDetail.bodyExcerptLabel", cs: "Text (výňatek)", en: "Text (excerpt)" },
    { key: "mailDetail.participantLabel", cs: "Dítě", en: "Participant" },
    { key: "mailDetail.participantSearchPlaceholder", cs: "Hledat dítě (např. Novák)...", en: "Search participant (e.g. Novak)..." },
    { key: "mailDetail.participantNotFound", cs: "Nenalezeno", en: "Not found" },
    { key: "mailDetail.autoDetectedHint", cs: "Automaticky rozpoznáno (zkontrolujte).", en: "Auto-detected (please double-check)." },
    { key: "mailDetail.manuallySelectedHint", cs: "Vybráno ručně.", en: "Manually selected." },
    { key: "mailDetail.notDetectedHint", cs: "Dítě nebylo automaticky rozpoznáno – vyberte ručně.", en: "Participant wasn't auto-detected — please select manually." },
    { key: "mailDetail.attachmentsLabel", cs: "Přílohy", en: "Attachments" },
    { key: "mailDetail.noAttachments", cs: "Email nemá přílohy.", en: "This email has no attachments." },
    { key: "mailDetail.previewButton", cs: "Náhled", en: "Preview" },
    { key: "mailDetail.ignoreOption", cs: "Ignorovat", en: "Ignore" },
    { key: "mailDetail.noteLabel", cs: "Poznámka (volitelné)", en: "Note (optional)" },
    { key: "mailDetail.notePlaceholder", cs: "Např. Prosíme ještě o doplnění XYZ...", en: "E.g. Please also send XYZ..." },
    { key: "mailDetail.replyPreviewLabel", cs: "Náhled / úprava odpovědi", en: "Reply preview / edit" },
    { key: "mailDetail.selectParticipantHint", cs: "Vyberte dítě.", en: "Select a participant." },
    { key: "mailDetail.generatingDraft", cs: "Generuji návrh...", en: "Generating draft..." },
    { key: "mailDetail.draftUpdated", cs: "Návrh aktualizován (můžete upravit ručně).", en: "Draft updated (you can edit it manually)." },
    { key: "mailDetail.draftGenerationFailed", cs: "Chyba při generování návrhu.", en: "Failed to generate the draft." },
    { key: "mailDetail.actionsLabel", cs: "Akce", en: "Actions" },
    { key: "mailDetail.actionSaveAttachments", cs: "💾 Uložit přílohy", en: "💾 Save attachments" },
    { key: "mailDetail.actionSendReply", cs: "📧 Odeslat odpověď", en: "📧 Send reply" },
    { key: "mailDetail.actionMoveEmail", cs: "📁 Přesunout email", en: "📁 Move email" },
    { key: "mailDetail.actionUpdateStatus", cs: "📊 Aktualizovat stav dokumentů", en: "📊 Update document status" },
    { key: "mailDetail.flagOnlyHint", cs: "Označit jako přijaté bez přílohy:", en: "Mark as received without a file:" },
    { key: "mailDetail.executeButton", cs: "Provést vybrané akce", en: "Run selected actions" },
    { key: "mailDetail.deleteButton", cs: "Smazat email", en: "Delete email" },
    { key: "mailDetail.confirmDelete", cs: "Opravdu chcete smazat tento email? Tato akce je nevratná.", en: "Delete this email? This action can't be undone." },
    { key: "mailDetail.replyTextRequired", cs: "Pro odeslání odpovědi zadejte text.", en: "Enter reply text before sending." },
    { key: "mailDetail.executeFailed", cs: "Zpracování se nezdařilo.", en: "Processing failed." },
    { key: "mailDetail.deleteFailed", cs: "Smazání se nezdařilo.", en: "Deletion failed." },

    // Attachment preview modal
    { key: "attachmentPreview.errorRenderFailed", cs: "Náhled se nepodařilo vykreslit.", en: "Failed to render the preview." },
    { key: "attachmentPreview.noInlinePreview", cs: "Pro tento typ souboru není náhled k dispozici.", en: "No inline preview is available for this file type." },
    { key: "attachmentPreview.downloadLink", cs: "Stáhnout přílohu", en: "Download attachment" },

    // Bulk status modal
    { key: "bulkStatusModal.title", cs: "Hromadný status update", en: "Bulk status update" },
    { key: "bulkStatusModal.previewTitle", cs: "Náhled emailu", en: "Email preview" },
    { key: "bulkStatusModal.checkAllButton", cs: "Zaškrtnout vše", en: "Check all" },
    { key: "bulkStatusModal.uncheckAllButton", cs: "Odškrtnout vše", en: "Uncheck all" },
    { key: "bulkStatusModal.colSend", cs: "Odeslat", en: "Send" },
    { key: "bulkStatusModal.colParticipant", cs: "Dítě", en: "Participant" },
    { key: "bulkStatusModal.sendButton", cs: "Odeslat vybrané ({count})", en: "Send selected ({count})" },
    { key: "bulkStatusModal.confirmSend", cs: "Opravdu chcete odeslat email {count} rodičům? Tuto akci nelze vzít zpět.", en: "Send this email to {count} guardians? This action can't be undone." },
    { key: "bulkStatusModal.sending", cs: "Odesílám...", en: "Sending..." },
    { key: "bulkStatusModal.sendDone", cs: "Hotovo. Odesláno: {sent}, chyby: {failed}", en: "Done. Sent: {sent}, failed: {failed}" },
    { key: "bulkStatusModal.sendFailed", cs: "Odeslání se nezdařilo.", en: "Sending failed." },

    // Action log modal
    { key: "mailActionLogModal.title", cs: "Poslední akce", en: "Recent actions" },
    { key: "mailActionLogModal.empty", cs: "Žádné akce.", en: "No actions yet." },
    { key: "mailActionLogModal.action.bulk_move", cs: "Přesun emailu", en: "Move email" },
    { key: "mailActionLogModal.action.bulk_delete", cs: "Smazání emailu", en: "Delete email" },
    { key: "mailActionLogModal.action.attachment_saved", cs: "Uložení přílohy", en: "Attachment saved" },
    { key: "mailActionLogModal.action.mail_helper_reply", cs: "Odpověď rodiči", en: "Reply to guardian" },
    { key: "mailActionLogModal.action.mail_helper_bulk_status_update", cs: "Hromadný status update", en: "Bulk status update" },
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
