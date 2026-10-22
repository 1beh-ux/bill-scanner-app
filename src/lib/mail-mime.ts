import crypto from "crypto";
import { micromark } from "micromark";

export function encodeHeaderValue(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

export function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function chunk76(base64: string): string {
  return base64.replace(/(.{76})/g, "$1\r\n");
}

export function newMimeBoundary(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

// ---- Formatted bodies (2026-10-22): templates are written with the same light markdown as the public
// pages' texts (bold, italics, headings, lists, links; a single Enter = a line break). Every e-mail goes
// out as multipart/alternative: the plain text without the marks, and the HTML. micromark never passes
// raw HTML through, so a value typed by a parent can't inject markup.

const withBreaks = (text: string) => text.replace(/([^\n])\n(?=[^\n])/g, "$1  \n");

/** The body as plain text: marks removed, a link as "text (url)". */
export function markdownToPlain(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, url: string) => (label === url ? url : `${label} (${url})`))
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1$2");
}

/** The body as an HTML document for mail clients (inline styles only). */
export function markdownToHtml(text: string): string {
  const html = micromark(withBreaks(text));
  return `<!doctype html><html><body><div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a">${html}</div></body></html>`;
}

/** MIME lines of a message body part (headers + content): plain + HTML alternatives. */
export function textBodyPart(body: string): string[] {
  const alt = newMimeBoundary("alt");
  const part = (type: string, content: string) => [`--${alt}`, `Content-Type: ${type}; charset="UTF-8"`, `Content-Transfer-Encoding: base64`, ``, chunk76(Buffer.from(content, "utf-8").toString("base64")), ``];
  return [`Content-Type: multipart/alternative; boundary="${alt}"`, ``, ...part("text/plain", markdownToPlain(body)), ...part("text/html", markdownToHtml(body)), `--${alt}--`];
}
