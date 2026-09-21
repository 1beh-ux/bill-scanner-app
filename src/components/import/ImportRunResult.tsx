"use client";

import { useTranslations } from "@/lib/i18n";

export type RunRow = {
  name: string;
  kind: "imported" | "duplicate" | "skipped" | "failed";
  reason?: string;
};

export type RunResult = {
  source: "upload" | "camera" | "drive";
  rows: RunRow[];
  /** Multi-page PDFs that were split into one bill per page. */
  splits: { name: string; pageCount: number }[];
  /** Blank pages that were left out when splitting (no bill created for them). */
  blankPages?: { name: string; pageNumbers: number[] }[];
  /** Payers matched/created from Drive subfolder names (Drive import only). */
  payers?: { matched: string[]; created: string[] };
};

const CHIP: Record<RunRow["kind"], string> = {
  imported: "bg-pine/15 text-pine",
  duplicate: "bg-amber-100 text-amber-800",
  skipped: "bg-mist text-ink-secondary",
  failed: "bg-red-100 text-red-700",
};

// The outcome of ONE import run (upload, camera or Drive): a summary line and a
// row per file with what happened and why. Replaced on every run -- never
// accumulated across runs (the review table below is what carries the bills).
export default function ImportRunResult({ result }: { result: RunResult }) {
  const { t } = useTranslations();
  const count = (k: RunRow["kind"]) => result.rows.filter((r) => r.kind === k).length;
  const problems = result.rows.filter((r) => r.kind !== "imported");

  return (
    <div className="mb-4 rounded-lg border border-mist bg-paper-2 p-3">
      <p className="mb-1 text-[14px] font-medium text-ink">{t("importPage.result.title")}</p>
      <p className="mb-2 text-[13px] text-ink-secondary">
        {result.rows.length === 0
          ? t("importPage.result.nothing")
          : t("importPage.result.summary", {
              imported: String(count("imported")),
              duplicates: String(count("duplicate")),
              skipped: String(count("skipped")),
              failed: String(count("failed")),
            })}
      </p>

      {result.payers && (result.payers.matched.length > 0 || result.payers.created.length > 0) && (
        <p className="mb-2 text-[13px] text-ink-secondary">
          {t("importPage.result.payers", {
            matched: result.payers.matched.join(", ") || "—",
            created: result.payers.created.join(", ") || "—",
          })}
        </p>
      )}

      {result.splits.length > 0 && (
        <ul className="mb-2 list-disc pl-5 text-[13px] text-ink-secondary">
          {result.splits.map((s) => (
            <li key={s.name}>{t("importPage.result.split", { name: s.name, count: String(s.pageCount) })}</li>
          ))}
        </ul>
      )}

      {result.blankPages && result.blankPages.length > 0 && (
        <p className="mb-2 text-[13px] text-ink-secondary">
          {t("importPage.result.blankSkipped", {
            count: String(result.blankPages.reduce((n, b) => n + b.pageNumbers.length, 0)),
            details: result.blankPages.map((b) => t("importPage.result.blankDetail", { pages: b.pageNumbers.join(", "), name: b.name })).join("; "),
          })}
        </p>
      )}

      {problems.length > 0 && (
        <ul className="flex flex-col gap-1">
          {problems.map((r, i) => (
            <li key={`${r.name}-${i}`} className="flex flex-wrap items-baseline gap-2 text-[13px]">
              <span className={"rounded-full px-2 py-0.5 text-[11px] font-medium " + CHIP[r.kind]}>{t(`importPage.result.kind.${r.kind}`)}</span>
              <span className="break-all text-ink">{r.name}</span>
              {r.reason && <span className="text-ink-secondary">— {r.reason}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
