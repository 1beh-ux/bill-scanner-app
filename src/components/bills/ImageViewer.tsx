"use client";

import { useState } from "react";
import { Minus, Plus, Maximize2, MoveHorizontal } from "lucide-react";

// Bill image in a box of fixed height with its own scrolling, so a long receipt never makes
// the page long: "fit" shows it whole, otherwise width = zoom × the box width. Click toggles
// fit <-> full width.
type T = (key: string, vars?: Record<string, string>) => string;
const STEPS = [1, 1.5, 2, 3];

export default function ImageViewer({ src, alt, t }: { src: string; alt: string; t: T }) {
  const [zoom, setZoom] = useState<"fit" | number>("fit");
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const idx = zoom === "fit" ? -1 : STEPS.indexOf(zoom);
  const btn = "rounded p-1 text-ink-secondary hover:bg-paper hover:text-ink disabled:opacity-40";
  return (
    <div className="overflow-hidden rounded-lg border border-mist">
      <div className="flex items-center gap-1 border-b border-mist bg-paper-2 px-2 py-1 text-[12px]">
        <button type="button" className={btn + (zoom === "fit" ? " bg-paper text-ink" : "")} onClick={() => setZoom("fit")} title={t("imageViewer.fit")} aria-label={t("imageViewer.fit")}>
          <Maximize2 size={14} />
        </button>
        <button type="button" className={btn + (zoom === 1 ? " bg-paper text-ink" : "")} onClick={() => setZoom(1)} title={t("imageViewer.width")} aria-label={t("imageViewer.width")}>
          <MoveHorizontal size={14} />
        </button>
        <button type="button" className={btn} disabled={zoom === "fit"} onClick={() => setZoom(idx <= 0 ? "fit" : STEPS[idx - 1])} title={t("imageViewer.zoomOut")} aria-label={t("imageViewer.zoomOut")}>
          <Minus size={14} />
        </button>
        <button type="button" className={btn} disabled={idx === STEPS.length - 1} onClick={() => setZoom(STEPS[idx + 1])} title={t("imageViewer.zoomIn")} aria-label={t("imageViewer.zoomIn")}>
          <Plus size={14} />
        </button>
        <span className="ml-1 text-ink-secondary">{zoom === "fit" ? t("imageViewer.fit") : `${Math.round(zoom * 100)} %`}</span>
      </div>
      <div className={"h-[70vh] min-h-[480px] overflow-auto bg-paper " + (zoom === "fit" ? "flex items-center justify-center" : "")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API file, not a static asset */}
        <img
          src={src}
          alt={alt}
          onClick={() => setZoom(zoom === "fit" ? 1 : "fit")}
          onError={() => setFailed(true)}
          className={zoom === "fit" ? "max-h-full max-w-full cursor-zoom-in object-contain" : "max-w-none cursor-zoom-out"}
          style={zoom === "fit" ? undefined : { width: `${zoom * 100}%` }}
        />
      </div>
    </div>
  );
}
