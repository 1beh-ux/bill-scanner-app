"use client";

import { useRef, useState } from "react";
import { BODY_MAP_DOT_R, BODY_MAP_H, BODY_MAP_W, bodyMapSrc } from "@/lib/body-map";

type BodyView = "front" | "back";

export type BodyMapValue = { bodyView: BodyView; bodyXPct: number; bodyYPct: number } | null;

interface BodyMapPickerProps {
  value: BodyMapValue;
  onChange: (value: BodyMapValue) => void;
  locked?: boolean;
  frontLabel: string;
  backLabel: string;
  hintLabel: string;
  removeLabel: string;
}

export default function BodyMapPicker({
  value,
  onChange,
  locked,
  frontLabel,
  backLabel,
  hintLabel,
  removeLabel,
}: BodyMapPickerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewTab, setViewTab] = useState<BodyView>(value?.bodyView ?? "front");

  function handleTap(e: React.MouseEvent<SVGSVGElement>) {
    if (locked) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const xPct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const yPct = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    onChange({ bodyView: viewTab, bodyXPct: xPct, bodyYPct: yPct });
  }

  const tabClass = (active: boolean) =>
    "rounded-lg px-3 py-1 text-[13px] " + (active ? "bg-ember text-white" : "bg-paper-2 text-ink");

  return (
    <div>
      <div className="mb-2 flex gap-2">
        <button
          type="button"
          disabled={locked}
          onClick={() => setViewTab("front")}
          className={tabClass(viewTab === "front")}
        >
          {frontLabel}
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={() => setViewTab("back")}
          className={tabClass(viewTab === "back")}
        >
          {backLabel}
        </button>
      </div>
      {/* The silhouette image in a box of its exact ratio; the dot sits at the stored % (same in the PDF). */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${BODY_MAP_W} ${BODY_MAP_H}`}
        onClick={handleTap}
        className={"h-80 w-auto rounded-lg border border-mist bg-white " + (locked ? "" : "cursor-crosshair")}
        style={{ aspectRatio: `${BODY_MAP_W} / ${BODY_MAP_H}` }}
      >
        <image href={bodyMapSrc(viewTab)} x="0" y="0" width={BODY_MAP_W} height={BODY_MAP_H} />
        {value && value.bodyView === viewTab && (
          <circle
            cx={(value.bodyXPct / 100) * BODY_MAP_W}
            cy={(value.bodyYPct / 100) * BODY_MAP_H}
            r={BODY_MAP_DOT_R}
            fill="#e05d38"
            stroke="white"
            strokeWidth="3"
          />
        )}
      </svg>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        {!locked && <p className="text-[12px] text-ink-secondary">{hintLabel}</p>}
        {value && !locked && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="whitespace-nowrap text-[12px] text-ember hover:underline"
          >
            {removeLabel}
          </button>
        )}
      </div>
    </div>
  );
}
