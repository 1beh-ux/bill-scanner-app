// The text of a .docx / .xlsx for the AI recipe import (Gemini reads PDFs and photos itself, not Office files).
// Both are zip files of XML: a minimal zip reader (stored / deflate entries) on node:zlib, no dependency.
import { inflateRawSync } from "node:zlib";

function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not_a_zip");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && buf.readUInt32LE(p) === 0x02014b50; n++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const skip = buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, inflateRawSync(raw));
    p += 46 + nameLen + skip;
  }
  return out;
}

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, "&");
const strip = (xml: string) => decode(xml.replace(/<[^>]+>/g, ""));

export function docxText(buf: Buffer): string {
  const xml = unzip(buf).get("word/document.xml")?.toString("utf8") ?? "";
  return strip(xml.replace(/<w:tab\/>/g, "\t").replace(/<\/w:p>/g, "\n").replace(/<\/w:tc>/g, "\t")).replace(/\n{3,}/g, "\n\n").trim();
}

/** Every sheet as tab-separated rows ("## List 1" headers). */
export function xlsxText(buf: Buffer): string {
  const files = unzip(buf);
  const shared = [...(files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => strip(m[1]));
  const sheets = [...files.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => parseInt(a.replace(/\D/g, "")) - parseInt(b.replace(/\D/g, "")));
  return sheets
    .map((k, i) => {
      const rows = [...files.get(k)!.toString("utf8").matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) =>
        [...r[1].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)]
          .map((c) => {
            const v = /<v>([\s\S]*?)<\/v>/.exec(c[2] ?? "")?.[1];
            if (/t="s"/.test(c[1])) return v == null ? "" : shared[+v] ?? "";
            if (/t="inlineStr"/.test(c[1])) return strip(c[2] ?? "");
            return v == null ? "" : decode(v);
          })
          .join("\t")
          .replace(/\t+$/, "")
      );
      return `## List ${i + 1}\n` + rows.filter(Boolean).join("\n");
    })
    .join("\n\n")
    .trim();
}
