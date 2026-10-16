"use client";

import HelpLink from "@/components/HelpLink";

// Title row of the Banka pages, with the help page (content/help/banka.md).
export default function BankHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="flex items-center gap-2 text-[22px] font-semibold text-ink">
        {title}
        <HelpLink slug="banka" />
      </h1>
      {children}
    </div>
  );
}

/** Fio / sync status code -> text key. */
export const syncErrorKey = (code: string) => `bankSync.error.${code}`;
