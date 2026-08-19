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
// same "- ✅/❌ {displayName}," line shape in both.
export function buildDocumentChecklistLines(
  documentTypes: DocumentListItem[],
  receivedItemIds: Set<string>,
  opts: { isFirstTimeApplication?: boolean } = {}
): string[] {
  return documentTypes.map((docType) => {
    const displayName = documentDisplayName(docType);
    const isComplete = receivedItemIds.has(docType.id);
    const icon = isComplete ? "✅" : "❌";

    // APPLICATION is an event-configured convention (EventListItem.key),
    // not a typed field -- see mail-helper-module-design.md and the
    // foundation-session plan's judgment call #3.
    if (docType.key === "APPLICATION" && isComplete && opts.isFirstTimeApplication) {
      return `- ${icon} ${displayName} (tímto potvrzujeme místo na táboře),`;
    }
    return `- ${icon} ${displayName},`;
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

  const url = (opts.questionnaireUrl || "").trim();
  const questionnaireLines =
    opts.questionnaireNeeded && url ? ["", `Odkaz na vyplnění dotazníku: ${url}.`, ""] : [];

  const note = (opts.note || "").trim();
  const noteLines = note ? ["", note, ""] : [];

  return [
    "Dobrý den,",
    "",
    "Děkujeme za zaslání a posíláme potvrzení o aktuálním stavu dokumentů:",
    "",
    ...docLines,
    ...questionnaireLines,
    ...noteLines,
    "Děkujeme za důvěru,",
    "",
    opts.signature,
  ].join("\n");
}
