// Port of the old app's buildSingleReplyTextCz_ (docs/mail helper original
// app script.txt lines 1156-1203). "Received" in the new relational schema
// is row-existence on ParticipantDocument, not a spreadsheet column value --
// callers pass in the set of EventListItem ids to treat as received
// (existing rows plus whatever the current attachment-mapping/flag
// selections would add if executed), so the same function renders both the
// live-regenerating preview and the actually-sent text.

export type DocumentTypeData = {
  displayName?: string;
  expectedValue?: string;
  filenameSuffix?: string;
  // Registration-document merge (src/lib/document-merge.ts) -- Google Doc
  // template to merge + export on acceptance, and whether to do so by
  // default (per-send opt-out happens in ComposeEmailModal, not here).
  templateGoogleDocId?: string;
  autoAttachOnAccept?: boolean;
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

export function buildSingleReplyText(opts: {
  documentTypes: DocumentListItem[];
  receivedItemIds: Set<string>;
  isFirstTimeApplication: boolean;
  questionnaireNeeded: boolean;
  questionnaireUrl?: string | null;
  note?: string;
  signature: string;
}): string {
  const docLines = buildDocumentChecklistLines(opts.documentTypes, opts.receivedItemIds, {
    isFirstTimeApplication: opts.isFirstTimeApplication,
  });

  // Leading blank line dropped here -- the unconditional one right after docLines below
  // now covers it, whether or not there's a questionnaire link or note.
  const url = (opts.questionnaireUrl || "").trim();
  const questionnaireLines = opts.questionnaireNeeded && url ? [`Odkaz na vyplnění dotazníku: ${url}.`, ""] : [];

  const note = (opts.note || "").trim();
  const noteLines = note ? [note, ""] : [];

  return [
    "Dobrý den,",
    "",
    "Děkujeme za zaslání a posíláme potvrzení o aktuálním stavu dokumentů:",
    "",
    ...docLines,
    // Part 11-B.6: unconditional, not just when a questionnaire link or note happens to
    // supply one -- without a note/questionnaire the closing used to run on immediately
    // after the last checklist line.
    "",
    ...questionnaireLines,
    ...noteLines,
    "Děkujeme za důvěru,",
    "",
    opts.signature,
  ].join("\n");
}
