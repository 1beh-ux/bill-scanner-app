// Self-check for HTML e-mail body -> text: `npx tsx src/lib/mail-read.check.ts`
import assert from "node:assert/strict";
import { htmlToText } from "@/lib/mail-read";
assert.equal(htmlToText("<html><head><style>p{}</style></head><body><p>Dobr&yacute; den,</p><div>posíl&aacute;m&nbsp;přihlášku<br>Díky &amp; zdravím</div><ul><li>a</li><li>b</li></ul></body></html>"), "Dobrý den,\nposílám přihlášku\nDíky & zdravím\n- a\n- b");
assert.equal(htmlToText("x &#233; &#xe9; y"), "x é é y");
console.log("ok");
assert.equal(htmlToText("&Scaron;&iacute;&rcaron;e &uring;"), "Šíře ů");
