import { getGmailClient } from "@/lib/gmail-client";
import { chunk76, base64UrlEncode, encodeHeaderValue } from "@/lib/mail-mime";

export type GmailAttachmentMeta = {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
};

export type GmailMessageSummary = {
  messageId: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
};

export type GmailMessageDetail = GmailMessageSummary & {
  bodySnippet: string;
  attachments: GmailAttachmentMeta[];
};

type GmailHeader = { name?: string | null; value?: string | null };
type GmailPart = {
  mimeType?: string | null;
  filename?: string | null;
  body?: { data?: string | null; attachmentId?: string | null; size?: number | null } | null;
  parts?: GmailPart[] | null;
};

// Bounded-concurrency map -- fetching N messages one at a time (sequential
// awaits) turned a 25-message inbox load into ~90s of pure network
// round-trip latency. Firing them all at once risks bursting past Gmail
// API's per-second quota for large counts (up to 200), so batches of 10
// balance speed against that.
const CONCURRENCY = 10;
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  const h = headers?.find((x) => (x.name || "").toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

function findPlainTextBody(part: GmailPart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf-8");
  }
  for (const child of part.parts || []) {
    const found = findPlainTextBody(child);
    if (found) return found;
  }
  return "";
}

function collectAttachments(part: GmailPart | undefined, out: GmailAttachmentMeta[]): void {
  if (!part) return;
  if (part.filename && part.body?.attachmentId) {
    out.push({
      attachmentId: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType || "application/octet-stream",
      size: part.body.size || 0,
    });
  }
  for (const child of part.parts || []) {
    collectAttachments(child, out);
  }
}

// Mirrors the old app's listInboxMessageDetails_ -- fetches every message's
// full payload up front (not just headers) so the detail panel never needs
// a second round trip once the list has loaded.
export async function listInboxMessagesWithDetails(
  senderEmail: string,
  count: number
): Promise<GmailMessageDetail[]> {
  const gmail = await getGmailClient(senderEmail);
  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: "in:inbox -from:me",
    maxResults: Math.max(1, Math.min(count, 200)),
  });
  const ids = (listRes.data.messages || []).map((m) => m.id).filter((id): id is string => !!id);

  const details = await mapWithConcurrency(ids, CONCURRENCY, async (id): Promise<GmailMessageDetail> => {
    const res = await gmail.users.messages.get({ userId: "me", id, format: "full" });
    const msg = res.data;
    const headers = (msg.payload?.headers || []) as GmailHeader[];
    const payload = msg.payload as GmailPart | undefined;
    const attachments: GmailAttachmentMeta[] = [];
    collectAttachments(payload, attachments);
    const dateHeader = headerValue(headers, "date");

    return {
      messageId: id,
      threadId: msg.threadId || "",
      from: headerValue(headers, "from"),
      subject: headerValue(headers, "subject"),
      date: dateHeader ? new Date(dateHeader).toISOString() : "",
      snippet: (msg.snippet || "").slice(0, 200),
      bodySnippet: findPlainTextBody(payload).slice(0, 1200),
      attachments,
    };
  });

  details.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return details;
}

// Extracts a bare email address from a "From" header value, which can be
// either "Name <addr@x.com>" or a bare "addr@x.com". Used so the reply
// recipient is always derived from Gmail's own record of who sent the
// original message, never trusted from client-supplied input.
export function extractEmailAddress(fromHeaderValue: string): string {
  const match = fromHeaderValue.match(/<([^>]+)>/);
  return (match ? match[1] : fromHeaderValue).trim();
}

export async function getReplyToAddress(senderEmail: string, messageId: string): Promise<string> {
  const gmail = await getGmailClient(senderEmail);
  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: ["From"],
  });
  const headers = (res.data.payload?.headers || []) as GmailHeader[];
  return extractEmailAddress(headerValue(headers, "From"));
}

export async function getMessageAttachmentContent(
  senderEmail: string,
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const gmail = await getGmailClient(senderEmail);
  const res = await gmail.users.messages.attachments.get({ userId: "me", messageId, id: attachmentId });
  const data = res.data.data;
  if (!data) throw new Error("attachment_data_missing");
  return Buffer.from(data, "base64url");
}

// Threaded reply -- no precedent elsewhere in this codebase (sendParentSummaryEmail
// never threads). In-Reply-To/References must be set from the ORIGINAL message's
// RFC Message-Id header, not Gmail's internal message id, or mail clients won't
// group the reply into the same thread.
export async function replyToMessage(
  senderEmail: string,
  opts: { messageId: string; to: string; subject: string; body: string; fromName: string }
): Promise<void> {
  const gmail = await getGmailClient(senderEmail);
  const original = await gmail.users.messages.get({
    userId: "me",
    id: opts.messageId,
    format: "metadata",
    metadataHeaders: ["Message-Id", "References"],
  });
  const headers = (original.data.payload?.headers || []) as GmailHeader[];
  const origMessageId = headerValue(headers, "Message-Id");
  const origReferences = headerValue(headers, "References");
  const threadId = original.data.threadId || undefined;

  const subject = /^re:/i.test(opts.subject) ? opts.subject : `Re: ${opts.subject}`;
  const bodyBase64 = chunk76(Buffer.from(opts.body, "utf-8").toString("base64"));

  const headerLines = [
    `From: ${encodeHeaderValue(opts.fromName)} <${senderEmail}>`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeaderValue(subject)}`,
  ];
  if (origMessageId) {
    headerLines.push(`In-Reply-To: ${origMessageId}`);
    headerLines.push(`References: ${[origReferences, origMessageId].filter(Boolean).join(" ")}`);
  }
  headerLines.push(
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    bodyBase64
  );

  const raw = base64UrlEncode(Buffer.from(headerLines.join("\r\n"), "utf-8"));
  await gmail.users.messages.send({ userId: "me", requestBody: { raw, threadId } });
}

export async function moveMessageToDoneLabel(
  senderEmail: string,
  messageId: string,
  labelName: string
): Promise<void> {
  const gmail = await getGmailClient(senderEmail);
  const labelsRes = await gmail.users.labels.list({ userId: "me" });
  let label = (labelsRes.data.labels || []).find((l) => l.name === labelName);
  if (!label) {
    const created = await gmail.users.labels.create({
      userId: "me",
      requestBody: { name: labelName, labelListVisibility: "labelShow", messageListVisibility: "show" },
    });
    label = created.data;
  }
  if (!label?.id) throw new Error("label_create_failed");

  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { addLabelIds: [label.id], removeLabelIds: ["INBOX"] },
  });
}

export async function moveMessageToTrash(senderEmail: string, messageId: string): Promise<void> {
  const gmail = await getGmailClient(senderEmail);
  await gmail.users.messages.trash({ userId: "me", id: messageId });
}
