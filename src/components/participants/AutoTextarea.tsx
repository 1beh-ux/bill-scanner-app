"use client";

import { useLayoutEffect, useRef } from "react";

/** A text box that grows with its text (one line when empty), so long values are readable. */
export default function AutoTextarea({ value, onChange, className, minRows = 1 }: { value: string; onChange: (v: string) => void; className?: string; minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={ref} value={value} rows={minRows} onChange={(e) => onChange(e.target.value)} className={(className ?? "") + " resize-none overflow-hidden"} />;
}
