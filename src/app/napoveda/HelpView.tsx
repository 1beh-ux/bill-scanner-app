"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FileDown } from "lucide-react";
import { useTranslations } from "@/lib/i18n";

// Topic list + the selected topic. The URL hash is the topic slug, so the "?"
// links across the app (src/components/HelpLink.tsx) open a topic directly.
export default function HelpView({
  pdfPath,
  topics,
  panels,
}: {
  pdfPath: string;
  topics: { slug: string; title: string }[];
  panels: Record<string, ReactNode>;
}) {
  const { t } = useTranslations();
  const [slug, setSlug] = useState(topics[0]?.slug ?? "");

  useEffect(() => {
    const read = () => {
      const s = decodeURIComponent(window.location.hash.slice(1));
      if (topics.some((x) => x.slug === s)) setSlug(s);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [topics]);

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold text-ink">{t("help.title")}</h1>
        <a
          href={pdfPath}
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
          {topics.map((x) => (
            <a
              key={x.slug}
              href={`#${x.slug}`}
              className={
                "rounded-lg px-3 py-1.5 text-[13px] " +
                (x.slug === slug ? "bg-ember/15 font-medium text-ink" : "text-ink-secondary hover:bg-paper-2 hover:text-ink")
              }
            >
              {x.title}
            </a>
          ))}
        </nav>
        <div className="min-w-0 flex-1 rounded-lg border border-mist bg-paper p-4 md:p-6">{panels[slug]}</div>
      </div>
    </div>
  );
}
