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

// An image shown inside the text (e.g. the payment QR): the body holds INLINE_MARK(cid) where it goes.
export type InlineImage = { cid: string; buffer: Buffer; mimeType: string; alt: string };
export const inlineMark = (cid: string) => `[[inline:${cid}]]`;
const INLINE_RE = /\[\[inline:([a-z0-9_]+)\]\]/g;

/** MIME lines of a message body part (headers + content): plain + HTML alternatives, with any inline images. */
export function textBodyPart(body: string, inline: InlineImage[] = []): string[] {
  const alt = newMimeBoundary("alt");
  const part = (type: string, content: string) => [`--${alt}`, `Content-Type: ${type}; charset="UTF-8"`, `Content-Transfer-Encoding: base64`, ``, chunk76(Buffer.from(content, "utf-8").toString("base64")), ``];
  const byCid = new Map(inline.map((i) => [i.cid, i]));
  const plain = markdownToPlain(body).replace(INLINE_RE, "");
  const html = markdownToHtml(body).replace(INLINE_RE, (_, cid: string) => {
    const img = byCid.get(cid);
    return img ? `<img src="cid:${cid}" alt="${img.alt.replace(/"/g, "")}" width="200" height="200" style="display:block;margin:8px 0">` : "";
  });
  const alternative = [`Content-Type: multipart/alternative; boundary="${alt}"`, ``, ...part("text/plain", plain), ...part("text/html", html), `--${alt}--`];
  const used = inline.filter((i) => body.includes(inlineMark(i.cid)));
  if (!used.length) return alternative;
  // multipart/related: the HTML refers to the images by Content-ID.
  const rel = newMimeBoundary("rel");
  return [
    `Content-Type: multipart/related; boundary="${rel}"`,
    ``,
    `--${rel}`,
    ...alternative,
    ``,
    ...used.flatMap((i) => [`--${rel}`, `Content-Type: ${i.mimeType}`, `Content-Transfer-Encoding: base64`, `Content-ID: <${i.cid}>`, `Content-Disposition: inline; filename="${i.cid}.png"`, ``, chunk76(i.buffer.toString("base64")), ``]),
    `--${rel}--`,
  ];
}
