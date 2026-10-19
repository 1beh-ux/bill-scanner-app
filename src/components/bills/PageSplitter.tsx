"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { cutsEvery, groupsFrom, isWholeFile } from "@/lib/bill-pages";

export type SplitPart = { id: string; originalFilename: string; pageCount: number };

const GROUP_BORDER = ["border-ember", "border-pine", "border-sky-500", "border-amber-500"];
const btn = "rounded-lg border border-mist bg-paper px-2.5 py-1 text-[12px] text-ink hover:bg-paper-2 disabled:opacity-50";

// Import page: a multi-page PDF bill's pages as thumbnails, like a PDF cut/merge tool --
// ✂ between two pages starts the next bill, drag (or ← →) reorders, × leaves a page out.
// Blank pages (bill-ingest.ts) start left out. Applied via POST /api/bills/[id]/split.
export default function PageSplitter({
  billId,
  pageCount,
  blankPages,
  onDone,
}: {
  billId: string;
  pageCount: number;
  blankPages: number[];
  onDone: (created: SplitPart[], reprocess: boolean) => void;
}) {
  const { t } = useTranslations();
  const [thumbs, setThumbs] = useState<(string | null)[]>(() => Array(pageCount).fill(null));
  const [pages, setPages] = useState(() => {
    const allBlank = blankPages.length >= pageCount;
    return Array.from({ length: pageCount }, (_, page) => ({ page, removed: !allBlank && blankPages.includes(page) }));
  });
  const [cuts, setCuts] = useState<Set<number>>(new Set());
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        const doc = await pdfjsLib.getDocument({ url: `/api/bills/${billId}/file` }).promise;
        for (let i = 0; i < doc.numPages && !cancelled; i++) {
          const page = await doc.getPage(i + 1);
          const viewport = page.getViewport({ scale: 600 / page.getViewport({ scale: 1 }).width });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          const url = canvas.toDataURL("image/jpeg", 0.8);
          if (!cancelled) setThumbs((prev) => prev.map((x, j) => (j === i ? url : x)));
        }
      } catch {
        if (!cancelled) setError(t("pageSplit.renderFailed"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billId]);

  const groups = useMemo(() => groupsFrom(pages, cuts), [pages, cuts]);
  const groupOf = useMemo(() => new Map(groups.flatMap((g, gi) => g.map((p) => [p, gi] as const))), [groups]);
  const unchanged = groups.length === 0 || isWholeFile(groups, pageCount);
  const keptCount = pages.filter((p) => !p.removed).length;

  function move(from: number, to: number) {
    if (to < 0 || to >= pages.length || from === to) return;
    setPages((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function toggleCut(page: number) {
    setCuts((prev) => {
      const next = new Set(prev);
      if (!next.delete(page)) next.add(page);
      return next;
    });
  }

  async function apply() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/bills/${billId}/split`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groups }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(t(`billPages.error.${data.error ?? "failed"}`));
      return;
    }
    onDone(data.created, data.reprocess === true);
  }

  return (
    <div className="rounded-lg border border-mist bg-paper p-3">
      <p className="mb-2 text-[12px] text-ink-secondary">{t("pageSplit.hint")}</p>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button onClick={() => setCuts(new Set())} className={btn}>
          {t("pageSplit.together")}
        </button>
        {Array.from({ length: Math.min(keptCount - 1, 5) }, (_, i) => i + 1).map((n) => (
          <button key={n} onClick={() => setCuts(cutsEvery(pages, n))} className={btn}>
            {t("pageSplit.every", { n: String(n) })}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-stretch gap-y-3">
        {pages.map((p, i) => {
          const gi = groupOf.get(p.page);
          const last = i === pages.length - 1;
          return (
            <div key={p.page} className="flex items-stretch">
              <div
                draggable
                onDragStart={() => setDragFrom(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragFrom !== null) move(dragFrom, i);
                  setDragFrom(null);
                }}
                className={
                  "flex w-[112px] cursor-grab flex-col gap-1 rounded-md border-2 bg-paper-2 p-1 " +
                  (p.removed ? "border-dashed border-mist opacity-40" : GROUP_BORDER[(gi ?? 0) % GROUP_BORDER.length])
                }
              >
                <button onClick={() => setZoom(p.page)} className="flex h-[140px] items-center justify-center overflow-hidden bg-white">
                  {thumbs[p.page] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbs[p.page]!} alt="" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-[11px] text-ink-secondary">{t("common.loading")}</span>
                  )}
                </button>
                <div className="flex items-center justify-between text-[11px] text-ink-secondary">
                  <button onClick={() => move(i, i - 1)} disabled={i === 0} title={t("pageSplit.moveLeft")} className="px-1 disabled:opacity-30">←</button>
                  <span>
                    {p.page + 1}
                    {!p.removed && gi !== undefined && groups.length > 1 && <b className="ml-1 text-ink">#{gi + 1}</b>}
                    {blankPages.includes(p.page) && ` · ${t("pageSplit.blank")}`}
                  </span>
                  <button onClick={() => move(i, i + 1)} disabled={last} title={t("pageSplit.moveRight")} className="px-1 disabled:opacity-30">→</button>
                </div>
                <button
                  onClick={() => setPages((prev) => prev.map((x) => (x.page === p.page ? { ...x, removed: !x.removed } : x)))}
                  className="text-[11px] text-ink-secondary hover:text-ink hover:underline"
                >
                  {p.removed ? t("pageSplit.restore") : t("pageSplit.remove")}
                </button>
              </div>
              {!last && (
                <button
                  onClick={() => toggleCut(p.page)}
                  title={t("pageSplit.cut")}
                  className={
                    "mx-0.5 flex w-6 items-center justify-center rounded text-[14px] " +
                    (cuts.has(p.page) ? "border-x-2 border-dashed border-red-500 text-red-600" : "text-mist hover:bg-paper-2 hover:text-ink-secondary")
                  }
                >
                  ✂
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={apply}
          disabled={busy || unchanged}
          className="rounded-lg bg-ember px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ember-hover disabled:opacity-50"
        >
          {busy ? t("common.loading") : groups.length > 1 ? t("pageSplit.apply", { count: String(groups.length) }) : t("pageSplit.applyOne")}
        </button>
        {error && <span className="text-[13px] text-red-600">{error}</span>}
      </div>

      {zoom !== null && thumbs[zoom] && (
        <div onClick={() => setZoom(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbs[zoom]!} alt="" className="max-h-full max-w-full rounded bg-white" />
        </div>
      )}
    </div>
  );
}
