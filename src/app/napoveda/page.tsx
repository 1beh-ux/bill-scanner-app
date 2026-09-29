import ReactMarkdown from "react-markdown";
import { HELP_PDF_PATH, loadHelpTopics } from "@/lib/help-content";
import HelpView from "./HelpView";

// Prerendered at build: content/help/*.md is read here, not at request time
// (the standalone image doesn't ship the .md files).
export const dynamic = "force-static";

export default function HelpPage() {
  const topics = loadHelpTopics();
  return (
    <HelpView
      pdfPath={HELP_PDF_PATH}
      topics={topics.map((t) => ({ slug: t.slug, title: t.title }))}
      panels={Object.fromEntries(
        topics.map((t) => [
          t.slug,
          <article key={t.slug} className="help-md">
            <h2 id={t.slug}>{t.title}</h2>
            <ReactMarkdown>{t.body}</ReactMarkdown>
          </article>,
        ])
      )}
    />
  );
}
