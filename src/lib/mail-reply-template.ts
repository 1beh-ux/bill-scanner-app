// Document checklist lines shared by the Pošta reply (src/lib/mail-reply-build.ts,
// the editable "Odpověď na e-mail" template -- originally the old app's
// buildSingleReplyTextCz_) and the bulk status e-mail. "Received" is
// row-existence on ParticipantDocument; callers pass the ids to treat as received.

export type DocumentTypeData = {
  displayName?: string;
  expectedValue?: string;
  filenameSuffix?: string;
  // Registration-document merge (src/lib/document-merge.ts) -- Google Doc
  // template to merge + export on acceptance, and whether to do so by
  // default (per-send opt-out happens in ComposeEmailModal, not here).
  templateGoogleDocId?: string;
  autoAttachOnAccept?: boolean;
  // The same PDF for everyone (e.g. "Pokyny"): the Google Doc is exported as
  // is -- no merge, no per-participant copy -- and it is not a tracked
  // document (no received/missing status, not in checklists).
  staticAttachment?: boolean;
};

export type DocumentListItem = {
  id: string;
  key: string | null;
  name: string;
  data: DocumentTypeData | null;
};

export function documentDisplayName(docType: DocumentListItem): string {
  return docType.data?.displayName || docType.name;
}

// Shared by the single-reply template and the bulk-status checklist block --
// same "- icon displayName — word" line shape in both (Part 5/8/11-B.6: icon
// plus word, since icon-only isn't accessible without colour/emoji support;
// no trailing comma -- one item per line is enough separation on its own).
export function buildDocumentChecklistLines(
  documentTypes: DocumentListItem[],
  receivedItemIds: Set<string>,
  opts: { isFirstTimeApplication?: boolean } = {}
): string[] {
  return documentTypes.map((docType) => {
    const displayName = documentDisplayName(docType);
    const isComplete = receivedItemIds.has(docType.id);
    const icon = isComplete ? "✔" : "✖";
    const word = isComplete ? "doručeno" : "chybí";

    // APPLICATION is an event-configured convention (EventListItem.key),
    // not a typed field -- see mail-helper-module-design.md and the
    // foundation-session plan's judgment call #3.
    if (docType.key === "APPLICATION" && isComplete && opts.isFirstTimeApplication) {
      return `- ${icon} ${displayName} — ${word} (tímto potvrzujeme místo na táboře)`;
    }
    return `- ${icon} ${displayName} — ${word}`;
  });
}
