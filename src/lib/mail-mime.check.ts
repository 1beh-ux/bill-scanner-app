// Self-check of formatted e-mail bodies: npx tsx src/lib/mail-mime.check.ts
import assert from "node:assert/strict";
import { markdownToHtml, markdownToPlain, textBodyPart } from "@/lib/mail-mime";
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
console.log("mime ok");
