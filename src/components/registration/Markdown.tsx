"use client";

import { useId, useState } from "react";
import ReactMarkdown from "react-markdown";

// Formatted text for parents (public page landing content, portal event info):
// markdown with headings, bold, italics, bullets (2 levels), numbered lists,
// links. A single Enter is a line break, like the plain text it replaced.
const STYLES =
  "[&_a]:text-ember [&_a]:underline [&_h2]:mt-3 [&_h2]:text-[18px] [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:text-[16px] [&_h3]:font-semibold " +
  "[&_strong]:font-semibold [&_em]:italic [&_p]:my-2 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul_ul]:list-[circle] [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5";

const withBreaks = (text: string) => text.replace(/([^\n])\n(?=[^\n])/g, "$1  \n");

export function MarkdownText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={STYLES + " " + className}>
      <ReactMarkdown>{withBreaks(text)}</ReactMarkdown>
    </div>
  );
}

type T = (key: string) => string;

// Textarea + a small toolbar that inserts the markdown, and a preview toggle.
export function MarkdownEditor({ value, onChange, rows, className, t }: { value: string; onChange: (v: string) => void; rows: number; className: string; t: T }) {
  const id = useId();
  const [preview, setPreview] = useState(false);

  function apply(edit: (sel: string) => string, lines: boolean) {
    const el = document.getElementById(id) as HTMLTextAreaElement | null;
    if (!el) return;
    let start = el.selectionStart;
    const end = el.selectionEnd;
    // Line formats act on whole lines.
    if (lines) start = value.lastIndexOf("\n", start - 1) + 1;
    const next = value.slice(0, start) + edit(value.slice(start, end)) + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => el.focus());
  }
  const wrap = (mark: string, empty: string) => apply((s) => mark + (s || empty) + mark, false);
  const prefix = (p: string) => apply((s) => (s || "").split("\n").map((l) => p + l.replace(/^(#{1,3} |\s*- |\d+\. )/, "")).join("\n"), true);

  const tools: { label: string; title: string; run: () => void; cls?: string }[] = [
    { label: "H", title: t("mdToolbar.heading"), run: () => prefix("## "), cls: "font-semibold text-[15px] leading-none" },
    { label: "H ", title: t("mdToolbar.subheading"), run: () => prefix("### "), cls: "font-semibold text-[11px]" },
    { label: "B", title: t("mdToolbar.bold"), run: () => wrap("**", t("mdToolbar.bold")), cls: "font-bold" },
    { label: "I", title: t("mdToolbar.italic"), run: () => wrap("*", t("mdToolbar.italic")), cls: "italic" },
    { label: "•", title: t("mdToolbar.bullet"), run: () => prefix("- ") },
    { label: "◦", title: t("mdToolbar.subBullet"), run: () => prefix("  - ") },
    { label: "1.", title: t("mdToolbar.numbered"), run: () => prefix("1. ") },
    { label: "🔗", title: t("mdToolbar.link"), run: () => apply((s) => `[${s || t("mdToolbar.link")}](https://)`, false) },
  ];

  return (
    <div className="mt-1">
      <div className="mb-1 flex flex-wrap items-center gap-1">
        {tools.map((tool) => (
          <button key={tool.label} type="button" title={tool.title} aria-label={tool.title} onClick={tool.run} className={"min-w-[28px] rounded border border-mist bg-paper-2 px-1.5 py-0.5 text-[13px] text-ink hover:border-ember " + (tool.cls ?? "")}>
            {tool.label}
          </button>
        ))}
        <button type="button" onClick={() => setPreview(!preview)} className="ml-auto text-[12px] text-ember hover:underline">
          {t(preview ? "mdToolbar.edit" : "mdToolbar.preview")}
        </button>
      </div>
      {preview ? (
        <MarkdownText text={value} className="min-h-[60px] rounded-lg border border-mist bg-paper px-3 py-2 text-[14px] text-ink" />
      ) : (
        <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className={className} />
      )}
    </div>
  );
}
