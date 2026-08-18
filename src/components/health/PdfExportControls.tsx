"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/i18n";

interface PdfExportControlsProps {
  // Builds the export URL given the currently selected mode/format --
  // lets each page supply its own date/date-range/type params.
  buildHref: (mode: "blank" | "hybrid", format: "A4" | "A3") => string;
}

export default function PdfExportControls({ buildHref }: PdfExportControlsProps) {
  const { t } = useTranslations();
  const [mode, setMode] = useState<"blank" | "hybrid">("blank");
  const [format, setFormat] = useState<"A4" | "A3">("A4");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value as "blank" | "hybrid")}
        className="rounded-lg border border-mist bg-paper-2 px-2 py-1.5 text-[13px] text-ink"
      >
        <option value="blank">{t("pdfExport.modeBlank")}</option>
        <option value="hybrid">{t("pdfExport.modeHybrid")}</option>
      </select>
      <select
        value={format}
        onChange={(e) => setFormat(e.target.value as "A4" | "A3")}
        className="rounded-lg border border-mist bg-paper-2 px-2 py-1.5 text-[13px] text-ink"
      >
        <option value="A4">A4</option>
        <option value="A3">A3</option>
      </select>
      <a
        href={buildHref(mode, format)}
        className="rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2"
      >
        {t("pdfExport.downloadButton")}
      </a>
    </div>
  );
}
