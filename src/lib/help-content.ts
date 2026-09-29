// Nápověda content: every content/help/*.md (frontmatter `title`, `order`),
// slug = file name. Edited as plain files (GitHub or locally) -- the
// /napoveda page is prerendered at build, so an edit goes live with the next
// deploy. Images live in public/napoveda/images/.
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export type HelpTopic = { slug: string; title: string; order: number; body: string };

export const HELP_PDF_PATH = "/napoveda/bill-scanner-v2-prirucka.pdf";
const HELP_DIR = path.join(process.cwd(), "content", "help");

export function loadHelpTopics(): HelpTopic[] {
  return fs
    .readdirSync(HELP_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const { data, content } = matter(fs.readFileSync(path.join(HELP_DIR, file), "utf8"));
      const slug = file.slice(0, -3);
      return {
        slug,
        title: typeof data.title === "string" ? data.title : slug,
        order: typeof data.order === "number" ? data.order : 999,
        body: content,
      };
    })
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "cs"));
}
