// Shared by scripts/audit-translations.ts and scripts/seed-missing-translations.ts:
// every { key, cs, en } row that the seed scripts define.
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");

export type SeedDef = { key: string; cs: string; en: string; file: string };

export function seedDefinitions(): SeedDef[] {
  const files = [
    path.join(ROOT, "prisma/seed.ts"),
    ...fs
      .readdirSync(path.join(ROOT, "scripts"))
      .filter((f) => /^seed-.*\.ts$/.test(f) && f !== "seed-missing-translations.ts")
      .map((f) => path.join(ROOT, "scripts", f)),
  ];
  const defs: SeedDef[] = [];
  const str = String.raw`(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\x60(?:[^\x60\\]|\\.)*\x60)`;
  const re = new RegExp(String.raw`key:\s*"([^"]+)"\s*,\s*cs:\s*(${str})\s*,\s*en:\s*(${str})`, "g");
  const unquote = (s: string) => s.slice(1, -1).replace(/\\(.)/g, "$1");
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    for (const m of text.matchAll(re)) defs.push({ key: m[1], cs: unquote(m[2]), en: unquote(m[3]), file: path.relative(ROOT, f) });
  }
  return defs;
}
