// Self-check of formatted e-mail bodies: npx tsx src/lib/mail-mime.check.ts
import assert from "node:assert/strict";
import { inlineMark, markdownToHtml, markdownToPlain, textBodyPart } from "@/lib/mail-mime";
const body = "Dobrý den,\n\n**důležité:** přihláška [zde](https://x.cz/a)\n- ✅ Přihláška\n- ❌ Lékař\n\nS pozdravem\nPavel <script>alert(1)</script>";
const plain = markdownToPlain(body);
assert.ok(plain.includes("důležité: přihláška zde (https://x.cz/a)"));
assert.ok(plain.includes("S pozdravem\nPavel"));
const html = markdownToHtml(body);
assert.ok(html.includes("<strong>důležité:</strong>"));
assert.ok(html.includes('<a href="https://x.cz/a">zde</a>'));
assert.ok(html.includes("<li>✅ Přihláška</li>"));
assert.ok(html.includes("S pozdravem<br />"));
assert.ok(!html.includes("<script>"), "raw HTML escaped");
assert.ok(!markdownToHtml("[x](javascript:alert(1))").includes("javascript:"));
assert.ok(markdownToPlain("Cena 2 * 3 = 6").includes("2 * 3"));
const lines = textBodyPart("Ahoj");
assert.ok(lines[0].startsWith("Content-Type: multipart/alternative"));
assert.ok(lines.at(-1)!.endsWith("--"));
// An inline image: multipart/related, the HTML points at it, the plain text drops the mark.
{
  const parts = textBodyPart(`Zaplaťte:\n\n${inlineMark("payment_qr")}\n\nDíky`, [{ cid: "payment_qr", buffer: Buffer.from("png"), mimeType: "image/png", alt: "QR" }]);
  assert.ok(parts[0].startsWith("Content-Type: multipart/related"));
  assert.ok(parts.includes("Content-ID: <payment_qr>"));
  const html = Buffer.from(parts[parts.indexOf('Content-Type: text/html; charset="UTF-8"') + 3], "base64").toString("utf-8");
  assert.ok(html.includes('src="cid:payment_qr"'), html);
  const plain = Buffer.from(parts[parts.indexOf('Content-Type: text/plain; charset="UTF-8"') + 3], "base64").toString("utf-8");
  assert.ok(!plain.includes("[[inline"));
  // No mark in the text = no related part (the image would be an orphan).
  assert.ok(textBodyPart("Ahoj", [{ cid: "payment_qr", buffer: Buffer.from("png"), mimeType: "image/png", alt: "QR" }])[0].startsWith("Content-Type: multipart/alternative"));
}
console.log("mime ok");
