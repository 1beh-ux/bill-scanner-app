// Blank-page detection for multi-page PDFs that get split into one bill per page
// (src/lib/bill-ingest.ts).
//
// "No text" is NOT a valid test on its own: scanned receipts and photos-in-a-PDF
// have no text layer at all. A page counts as blank only if ALL of these hold:
//   1. no extractable text,
//   2. no vector drawing (stroked/filled paths), and
//   3. no embedded image, OR every embedded image is (almost) one flat colour.
//
// The flat-colour test works on the decoded pixels of the image, pooled down to
// ~150 px wide, ignoring a 2 % border (scanner edges, punch shadows). Pooling keeps
// the block's WORST pixel (the one farthest from the background), so a thin line of
// text on a big scan still marks its block as content instead of being averaged away.
// More than 99.5 % background blocks = flat.
//
// Any failure (unreadable PDF, pdfjs problem) answers "not blank" -- a page is only
// ever dropped when we are sure.

const MAX_PAGES = 100;
const POOL_WIDTH = 150;
const BORDER_FRACTION = 0.02;
// Stricter than the "99.5 % of pixels" rule of thumb on purpose: blocks are pooled by their
// worst pixel (a 1 px line marks a whole block), so 99.9 % of BLOCKS being background is
// roughly as forgiving as 99.5 % of pixels for real noise, yet a single line of text still counts.
const BACKGROUND_SHARE = 0.999;
const TOLERANCE = 30; // per channel, out of 255: scanner noise / JPEG artefacts stay below this

export type PageVerdict = { blank: boolean; reason: "empty" | "flat_image" | "text" | "vector" | "image_content" | "error" };

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

// pdfjs ImageKind: 1 = 1 bit/pixel grayscale (packed), 2 = RGB 24bpp, 3 = RGBA 32bpp
type Decoded = { width: number; height: number; data: Uint8ClampedArray; kind: number };

/** RGB triple of pixel (x, y) for the supported kinds. */
function pixel(img: Decoded, x: number, y: number): [number, number, number] {
  const { width, data, kind } = img;
  if (kind === 1) {
    const rowBytes = Math.ceil(width / 8);
    const bit = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
    const v = bit ? 255 : 0;
    return [v, v, v];
  }
  const step = kind === 3 ? 4 : 3;
  const i = (y * width + x) * step;
  return [data[i], data[i + 1], data[i + 2]];
}

/**
 * True when the image is (almost) a single flat colour once the border is ignored.
 * Exported for tests.
 */
export function isFlatImage(img: Decoded): boolean {
  const { width, height } = img;
  if (width < 4 || height < 4) return true;
  const x0 = Math.floor(width * BORDER_FRACTION);
  const x1 = Math.ceil(width * (1 - BORDER_FRACTION));
  const y0 = Math.floor(height * BORDER_FRACTION);
  const y1 = Math.ceil(height * (1 - BORDER_FRACTION));
  const block = Math.max(1, Math.floor(width / POOL_WIDTH));

  // pass 1: dominant colour from a coarse grid (mode of 16-level buckets, then its true mean)
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  const coarse = Math.max(1, Math.floor(block / 2));
  for (let y = y0; y < y1; y += coarse) {
    for (let x = x0; x < x1; x += coarse) {
      const [r, g, b] = pixel(img, x, y);
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      e.n++;
      e.r += r;
      e.g += g;
      e.b += b;
      buckets.set(key, e);
    }
  }
  let dom = { n: 0, r: 0, g: 0, b: 0 };
  for (const e of buckets.values()) if (e.n > dom.n) dom = e;
  if (dom.n === 0) return true;
  const bg: [number, number, number] = [dom.r / dom.n, dom.g / dom.n, dom.b / dom.n];

  // pass 2: a pooled block is content if ANY pixel in it is farther than TOLERANCE from the background
  let blocks = 0;
  let content = 0;
  for (let by = y0; by < y1; by += block) {
    for (let bx = x0; bx < x1; bx += block) {
      blocks++;
      let deviates = false;
      for (let y = by; y < Math.min(by + block, y1) && !deviates; y++) {
        for (let x = bx; x < Math.min(bx + block, x1); x++) {
          const [r, g, b] = pixel(img, x, y);
          if (Math.abs(r - bg[0]) > TOLERANCE || Math.abs(g - bg[1]) > TOLERANCE || Math.abs(b - bg[2]) > TOLERANCE) {
            deviates = true;
            break;
          }
        }
      }
      if (deviates) content++;
    }
  }
  return blocks === 0 || (blocks - content) / blocks > BACKGROUND_SHARE;
}

async function analysePage(pdfjs: PdfJs, page: Awaited<ReturnType<Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>["getPage"]>>): Promise<PageVerdict> {
  const text = await page.getTextContent();
  if (text.items.some((it) => "str" in it && it.str.trim() !== "")) return { blank: false, reason: "text" };

  const ops = await page.getOperatorList();
  const OPS = pdfjs.OPS;
  const pathPaint = new Set<number>([
    OPS.stroke,
    OPS.closeStroke,
    OPS.fill,
    OPS.eoFill,
    OPS.fillStroke,
    OPS.eoFillStroke,
    OPS.closeFillStroke,
    OPS.closeEOFillStroke,
    OPS.shadingFill,
  ]);
  const imageIds: string[] = [];
  let hasInlineImage = false;
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    if (pathPaint.has(fn)) return { blank: false, reason: "vector" };
    // Newer pdfjs folds path painting into one constructPath op whose first arg is the paint op
    // (stroke/fill/...); endPath (clip only, no paint) is not drawing.
    if (fn === OPS.constructPath && pathPaint.has(ops.argsArray[i][0] as number)) return { blank: false, reason: "vector" };
    if (fn === OPS.paintImageXObject || fn === OPS.paintImageMaskXObject) imageIds.push(ops.argsArray[i][0] as string);
    else if (fn === OPS.paintInlineImageXObject || fn === OPS.paintInlineImageXObjectGroup) hasInlineImage = true;
  }

  if (imageIds.length === 0 && !hasInlineImage) return { blank: true, reason: "empty" };
  // Inline images are small by construction and rare in scans; not analysed -> treated as content.
  if (hasInlineImage) return { blank: false, reason: "image_content" };

  for (const id of imageIds) {
    const img = await new Promise<Decoded | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 10_000);
      page.objs.get(id, (o: unknown) => {
        clearTimeout(timer);
        resolve((o as Decoded) ?? null);
      });
    });
    // Can't read the pixels -> assume content.
    if (!img || !img.data || (img.kind !== 1 && img.kind !== 2 && img.kind !== 3)) return { blank: false, reason: "image_content" };
    if (!isFlatImage(img)) return { blank: false, reason: "image_content" };
  }
  return { blank: true, reason: "flat_image" };
}

/** One verdict per page of the PDF (1:1 with page order). Never throws. */
export async function analyseBlankPages(pdf: Buffer): Promise<PageVerdict[]> {
  try {
    const pdfjs = await loadPdfJs();
    const task = pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, verbosity: 0 });
    const doc = await task.promise;
    try {
      if (doc.numPages > MAX_PAGES) return Array.from({ length: doc.numPages }, () => ({ blank: false, reason: "error" as const }));
      const out: PageVerdict[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        try {
          out.push(await analysePage(pdfjs, await doc.getPage(i)));
        } catch (err) {
          console.log(`[pdf-blank] page ${i} could not be analysed, keeping it:`, String(err));
          out.push({ blank: false, reason: "error" });
        }
      }
      return out;
    } finally {
      await task.destroy();
    }
  } catch (err) {
    console.log("[pdf-blank] PDF could not be analysed, keeping every page:", String(err));
    return [];
  }
}

/**
 * Which pages of a split PDF become bills. `blank[i]` = page i is blank.
 * - blank pages are skipped and reported;
 * - if EVERY page is blank the first one is kept (a file must never vanish
 *   silently; normal processing then deals with it);
 * - no verdicts (analysis failed) = keep everything.
 */
export function planPdfPages(blank: boolean[], pageCount: number): { keep: number[]; skipped: number[] } {
  if (blank.length !== pageCount) return { keep: Array.from({ length: pageCount }, (_, i) => i), skipped: [] };
  const keep: number[] = [];
  const skipped: number[] = [];
  blank.forEach((isBlank, i) => (isBlank ? skipped.push(i) : keep.push(i)));
  if (keep.length === 0) return { keep: [0], skipped: skipped.filter((i) => i !== 0) };
  return { keep, skipped };
}
