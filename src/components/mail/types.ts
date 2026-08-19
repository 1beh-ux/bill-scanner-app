export type MailAttachment = {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
};

export type MailMessage = {
  messageId: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  bodySnippet: string;
  attachments: MailAttachment[];
};

export type DocumentTypeData = {
  displayName?: string;
  expectedValue?: string;
  filenameSuffix?: string;
};

export type DocumentType = {
  id: string;
  key: string | null;
  name: string;
  active: boolean;
  data: DocumentTypeData | null;
};

export type Guardian = {
  id: string;
  name: string | null;
  email: string;
  receivesCommunications: boolean;
};

export type Participant = {
  id: string;
  name: string;
  guardians: Guardian[];
};

export function documentDisplayName(docType: DocumentType): string {
  return docType.data?.displayName || docType.name;
}
