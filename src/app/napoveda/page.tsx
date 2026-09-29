"use client";

import { useEffect, useState } from "react";
import { FileDown } from "lucide-react";
import { useTranslations } from "@/lib/i18n";
import { HELP_PDF_PATH, HELP_TOPICS } from "@/content/help-topics";

// Nápověda: topic list + the selected topic (URL hash = topic slug, so the
// "?" links across the app can open a topic directly).
export default function HelpPage() {
  const { t } = useTranslations();
  const [slug, setSlug] = useState(HELP_TOPICS[0].slug);

  useEffect(() => {
    const read = () => {
      const s = decodeURIComponent(window.location.hash.slice(1));
      setSlug(HELP_TOPICS.some((x) => x.slug === s) ? s : HELP_TOPICS[0].slug);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const topic = HELP_TOPICS.find((x) => x.slug === slug) ?? HELP_TOPICS[0];

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold text-ink">{t("help.title")}</h1>
        <a
          href={HELP_PDF_PATH}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink hover:bg-mist"
        >
          <FileDown size={15} aria-hidden="true" />
          {t("help.downloadPdf")}
        </a>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        <nav className="flex shrink-0 flex-wrap gap-1 md:sticky md:top-4 md:w-56 md:flex-col md:self-start">
          {HELP_TOPICS.map((x) => (
            <a
              key={x.slug}
              href={`#${x.slug}`}
              className={
                "rounded-lg px-3 py-1.5 text-[13px] " +
                (x.slug === topic.slug ? "bg-ember/15 font-medium text-ink" : "text-ink-secondary hover:bg-paper-2 hover:text-ink")
              }
            >
              {x.title}
            </a>
          ))}
        </nav>

        <article className="min-w-0 flex-1 rounded-lg border border-mist bg-paper p-4 md:p-6">
          <h2 className="mb-3 text-[18px] font-semibold text-ink">{topic.title}</h2>
          <HelpBody body={topic.body} />
        </article>
      </div>
    </div>
  );
}

/** The tiny format of help-topics.ts: paragraphs, "- " bullets, "1. " steps, `code`. */
function HelpBody({ body }: { body: string }) {
  return (
    <div className="flex flex-col gap-3 text-[14px] leading-relaxed text-ink">
      {body.split(/\n\s*\n/).map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^- /.test(l)))
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.slice(2))}</li>
              ))}
            </ul>
          );
        if (lines.every((l) => /^\d+\. /.test(l)))
          return (
            <ol key={i} className="list-decimal space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\d+\. /, ""))}</li>
              ))}
            </ol>
          );
        return <p key={i}>{inline(block)}</p>;
      })}
    </div>
  );
}

function inline(text: string) {
  return text.split(/(`[^`]+`)/).map((part, i) =>
    part.startsWith("`") && part.endsWith("`") ? (
      <code key={i} className="rounded bg-paper-2 px-1 text-[13px]">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    )
  );
}
