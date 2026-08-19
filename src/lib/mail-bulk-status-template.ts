import { buildDocumentChecklistLines, type DocumentListItem } from "@/lib/mail-reply-template";

// Renders the {{document_checklist}} block substituted into the *editable*
// mail_helper_bulk_status_update EmailTemplate body -- unlike the single
// reply, this copy is user-editable (design doc decision 4), so only the
// checklist itself is generated, not surrounding boilerplate text.
export function buildDocumentChecklistText(
  documentTypes: DocumentListItem[],
  receivedItemIds: Set<string>
): string {
  return buildDocumentChecklistLines(documentTypes, receivedItemIds).join("\n");
}
