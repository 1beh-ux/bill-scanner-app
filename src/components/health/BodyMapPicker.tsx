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

// Schematic, filled humanoid outline -- not medical-grade art (no such
// asset exists to reuse in this project), but a solid silhouette with real
// width on the limbs rather than thin stick lines, so a tap can land on a
// specific spot along an arm or leg (upper vs. lower) instead of just "the
// arm" as a whole. Front/back share the same shape; a small visual cue
// (eyes vs. a spine line) is the only difference between them.
function BodyOutline({ view }: { view: BodyView }) {
  return (
    <g fill="currentColor" stroke="none">
      {/* legs (drawn first so the torso overlaps the hip joins cleanly) */}
      <line x1="85" y1="188" x2="78" y2="288" stroke="currentColor" strokeWidth="26" strokeLinecap="round" />
      <line x1="78" y1="288" x2="72" y2="384" stroke="currentColor" strokeWidth="20" strokeLinecap="round" />
      <line x1="115" y1="188" x2="122" y2="288" stroke="currentColor" strokeWidth="26" strokeLinecap="round" />
      <line x1="122" y1="288" x2="128" y2="384" stroke="currentColor" strokeWidth="20" strokeLinecap="round" />
      <ellipse cx="70" cy="390" rx="11" ry="7" />
      <ellipse cx="130" cy="390" rx="11" ry="7" />

      {/* arms */}
      <line x1="68" y1="72" x2="44" y2="140" stroke="currentColor" strokeWidth="22" strokeLinecap="round" />
      <line x1="44" y1="140" x2="37" y2="204" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
      <line x1="132" y1="72" x2="156" y2="140" stroke="currentColor" strokeWidth="22" strokeLinecap="round" />
      <line x1="156" y1="140" x2="163" y2="204" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
      <circle cx="37" cy="210" r="9" />
      <circle cx="163" cy="210" r="9" />

      {/* torso */}
      <path d="M 66 62 L 134 62 L 128 190 Q 100 202 72 190 Z" />

      {/* head */}
      <circle cx="100" cy="33" r="25" />
      {view === "front" ? (
        <>
          <circle cx="90" cy="30" r="3" className="fill-paper-2" />
          <circle cx="110" cy="30" r="3" className="fill-paper-2" />
        </>
      ) : (
        <line x1="100" y1="16" x2="100" y2="180" className="stroke-paper-2" strokeWidth="2" strokeLinecap="round" />
      )}
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
        viewBox="0 0 200 400"
        onClick={handleTap}
        className={
          "h-80 w-40 rounded-lg border border-mist bg-paper-2 text-ink-secondary " +
          (locked ? "" : "cursor-crosshair")
        }
      >
        <BodyOutline view={viewTab} />
        {value && value.bodyView === viewTab && (
          <circle
            cx={(value.bodyXPct / 100) * 200}
            cy={(value.bodyYPct / 100) * 400}
            r="7"
            fill="#e05d38"
            stroke="white"
            strokeWidth="1.5"
          />
        )}
      </svg>
    </div>
  );
}
