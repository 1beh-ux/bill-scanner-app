// Fixtures + checks for blank-page detection (src/lib/pdf-blank.ts):
//   text page, scanned-image page (no text layer), blank white page,
//   near-blank scan with noise, near-blank page with a faint scanner border,
//   vector-only page, and the "all pages blank" rule.
//
//   npx tsx scripts/test-blank-pages.ts
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";
import { analyseBlankPages, planPdfPages } from "../src/lib/pdf-blank";
import { humanAiFailureNote } from "../src/lib/ai-failure-note";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${!ok && detail ? `  -> ${detail}` : ""}`);
}

const W = 1000;
const H = 1400;

// White page with `noise` (+-) grain, optionally with a faint line drawn at `inset` px from the edge.
async function scan(opts: { noise?: number; faintBorderInset?: number; contentLines?: number; smallText?: boolean }): Promise<Buffer> {
  const raw = Buffer.alloc(W * H * 3, 250);
  if (opts.noise) for (let i = 0; i < raw.length; i++) raw[i] = Math.min(255, 250 + Math.round((Math.random() * 2 - 1) * opts.noise));
  let img = sharp(raw, { raw: { width: W, height: H, channels: 3 } });
  const shapes: string[] = [];
  if (opts.faintBorderInset !== undefined) {
    const o = opts.faintBorderInset;
    shapes.push(`<rect x="${o}" y="${o}" width="${W - 2 * o}" height="${H - 2 * o}" fill="none" stroke="rgb(185,185,185)" stroke-width="3"/>`);
  }
  // "text": a stack of dark bars like lines of a receipt
  for (let i = 0; i < (opts.contentLines ?? 0); i++) shapes.push(`<rect x="200" y="${200 + i * 60}" width="${300 + ((i * 97) % 300)}" height="14" fill="rgb(20,20,20)"/>`);
  if (opts.smallText) shapes.push(`<rect x="300" y="700" width="220" height="12" fill="rgb(30,30,30)"/>`);
  if (shapes.length) img = img.composite([{ input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${shapes.join("")}</svg>`), top: 0, left: 0 }]);
  return img.png().toBuffer();
}

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const addImagePage = async (png: Buffer) => {
    const p = doc.addPage([595, 842]);
    p.drawImage(await doc.embedPng(png), { x: 0, y: 0, width: 595, height: 842 });
  };

  // 0 text page
  doc.addPage([595, 842]).drawText("Potraviny Tesco, celkem 561,20 Kc", { x: 50, y: 700, size: 16, font });
  // 1 blank white page (nothing at all)
  doc.addPage([595, 842]);
  // 2 scanned receipt: image with content, no text layer
  await addImagePage(await scan({ noise: 4, contentLines: 14 }));
  // 3 blank scan: flat white with sensor noise
  await addImagePage(await scan({ noise: 6 }));
  // 4 near-blank with a faint scanner border inside the ignored 2 % band
  await addImagePage(await scan({ noise: 5, faintBorderInset: 10 }));
  // 5 vector-only page (a drawn rectangle, no text, no image)
  doc.addPage([595, 842]).drawRectangle({ x: 100, y: 100, width: 300, height: 200, borderColor: rgb(0, 0, 0), borderWidth: 2 });
  // 6 scan with one small line of dark text (little ink, but real content)
  await addImagePage(await scan({ noise: 4, smallText: true }));

  const verdicts = await analyseBlankPages(Buffer.from(await doc.save()));
  const v = (i: number) => `${verdicts[i]?.blank ? "blank" : "content"}/${verdicts[i]?.reason}`;
  check("analysis returns one verdict per page", verdicts.length === 7, String(verdicts.length));
  check("text page -> content (text)", verdicts[0]?.blank === false && verdicts[0].reason === "text", v(0));
  check("completely empty page -> blank (empty)", verdicts[1]?.blank === true && verdicts[1].reason === "empty", v(1));
  check("scanned receipt WITHOUT a text layer -> content (must not be dropped)", verdicts[2]?.blank === false && verdicts[2].reason === "image_content", v(2));
  check("flat white scan with sensor noise -> blank (flat_image)", verdicts[3]?.blank === true && verdicts[3].reason === "flat_image", v(3));
  check("near-blank scan with a faint border in the edge band -> blank", verdicts[4]?.blank === true, v(4));
  check("vector-only page -> content (never dropped)", verdicts[5]?.blank === false && verdicts[5].reason === "vector", v(5));
  check("scan with one small line of dark text -> content", verdicts[6]?.blank === false, v(6));

  console.log("\n== which pages become bills (planPdfPages)");
  let plan = planPdfPages([false, true, false], 3);
  check("mixed: blank page 2 skipped, 1 and 3 kept", JSON.stringify(plan) === JSON.stringify({ keep: [0, 2], skipped: [1] }), JSON.stringify(plan));
  plan = planPdfPages([true, true, true], 3);
  check("ALL pages blank: the first is kept, the rest skipped", JSON.stringify(plan) === JSON.stringify({ keep: [0], skipped: [1, 2] }), JSON.stringify(plan));
  plan = planPdfPages([], 3);
  check("analysis failed (no verdicts): every page kept", JSON.stringify(plan) === JSON.stringify({ keep: [0, 1, 2], skipped: [] }), JSON.stringify(plan));
  plan = planPdfPages([false, false], 2);
  check("nothing blank: nothing skipped", plan.skipped.length === 0 && plan.keep.length === 2);

  console.log("\n== garbage input never throws and never drops pages");
  const bad = await analyseBlankPages(Buffer.from("this is not a pdf"));
  check("unreadable PDF -> no verdicts (caller keeps everything)", bad.length === 0);

  console.log("\n== failed-bill note is a human message, never the AI's raw English");
  const raw = "The provided image is blank and contains no readable receipt content.";
  const note = humanAiFailureNote(raw);
  check("raw English AI text is not copied into the note", !note.includes("provided image") && !/[Tt]he provided/.test(note), note);
  check("blank-image failures get the specific Czech wording", /prázdn/i.test(note), note);
  check("any other failure gets the generic Czech message", /nepodařilo/.test(humanAiFailureNote("Something exploded: 500 upstream error")) && /nepodařilo/.test(humanAiFailureNote(null)));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
