"use client";

import { useRef, useState } from "react";

type BodyView = "front" | "back";

export type BodyMapValue = { bodyView: BodyView; bodyXPct: number; bodyYPct: number } | null;

interface BodyMapPickerProps {
  value: BodyMapValue;
  onChange: (value: BodyMapValue) => void;
  locked?: boolean;
  frontLabel: string;
  backLabel: string;
}

// Schematic outline, not medical-grade art -- functional for tap-to-mark.
// Front/back share the same silhouette; a small visual cue (eyes vs. a
// spine line) is the only difference, since there's nothing anatomical to
// draw on a plain outline.
function BodyOutline({ view }: { view: BodyView }) {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <circle cx="100" cy="45" r="32" strokeWidth="3" />
      {view === "front" ? (
        <>
          <circle cx="90" cy="42" r="3" fill="currentColor" stroke="none" />
          <circle cx="110" cy="42" r="3" fill="currentColor" stroke="none" />
        </>
      ) : (
        <line x1="100" y1="28" x2="100" y2="62" strokeWidth="2" />
      )}
      <path d="M 60 80 Q 100 70 140 80 L 145 200 Q 100 215 55 200 Z" />
      <path d="M 60 85 L 25 180" />
      <path d="M 140 85 L 175 180" />
      <path d="M 80 205 L 70 340" />
      <path d="M 120 205 L 130 340" />
    </g>
  );
}

export default function BodyMapPicker({
  value,
  onChange,
  locked,
  frontLabel,
  backLabel,
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
      <svg
        ref={svgRef}
        viewBox="0 0 200 360"
        onClick={handleTap}
        className={
          "h-72 w-40 rounded-lg border border-mist bg-paper-2 text-ink-secondary " +
          (locked ? "" : "cursor-crosshair")
        }
      >
        <BodyOutline view={viewTab} />
        {value && value.bodyView === viewTab && (
          <circle
            cx={(value.bodyXPct / 100) * 200}
            cy={(value.bodyYPct / 100) * 360}
            r="6"
            fill="#e05d38"
            stroke="white"
            strokeWidth="1.5"
          />
        )}
      </svg>
    </div>
  );
}
