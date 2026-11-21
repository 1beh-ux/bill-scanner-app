"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { docsUsing, type FmDocTemplate, type FmOverview, type OvField } from "./types";

// Overview (prompt screens 01–03): sources -> fields -> uses. Clicking a field (or a source / use) keeps only its
// connections lit; a calculated field also shows the fields it is built from as orange dashed lines.
type Edge = { from: string; to: string; kind: "src" | "use" | "dep" };

export default function FieldsOverview({ overview, docs, selected, onSelect }: { overview: FmOverview; docs: FmDocTemplate[] | null; selected: string | null; onSelect: (id: string | null) => void }) {
  const { t } = useTranslations();
  const boxRef = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<{ d: string; kind: Edge["kind"]; on: boolean }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Use nodes: the module surfaces, with "documents" split into each template once the template check loaded.
  const useNodes = useMemo(() => {
    const base = overview.uses.filter((u) => u !== "documents").map((u) => ({ id: `use:${u}`, label: t(`fieldsManager.use.${u}`) }));
    const docNodes = docs ? docs.filter((d) => !d.error).map((d) => ({ id: `doc:${d.docTypeId}`, label: d.name })) : [{ id: "use:documents", label: t("fieldsManager.use.documents") }];
    return [...base, ...docNodes];
  }, [overview.uses, docs, t]);

  const edges = useMemo(() => {
    const out: Edge[] = [];
    for (const f of overview.fields) {
      const fid = `field:${f.key}`;
      for (const s of f.sources) out.push({ from: `src:${s}`, to: fid, kind: "src" });
      for (const u of f.uses) if (u !== "documents") out.push({ from: fid, to: `use:${u}`, kind: "use" });
      if (docs) for (const d of docsUsing(f, docs)) out.push({ from: fid, to: `doc:${d.docTypeId}`, kind: "use" });
      else if (f.uses.includes("documents")) out.push({ from: fid, to: "use:documents", kind: "use" });
      for (const dep of f.deps) if (overview.fields.some((x) => x.key === dep)) out.push({ from: `field:${dep}`, to: fid, kind: "dep" });
    }
    return out;
  }, [overview.fields, docs]);

  // What stays lit for the selection: the node, its direct edges, and for a field its calculated dependencies.
  const lit = useMemo(() => {
    if (!selected) return null;
    const nodes = new Set([selected]);
    const on = new Set<number>();
    edges.forEach((e, i) => {
      if (e.from === selected || e.to === selected) {
        on.add(i);
        nodes.add(e.from);
        nodes.add(e.to);
      }
    });
    return { nodes, on };
  }, [selected, edges]);

  const draw = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    const b = box.getBoundingClientRect();
    setSize({ w: b.width, h: b.height });
    const pos = (id: string) => {
      const el = box.querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { l: r.left - b.left, r: r.right - b.left, y: r.top - b.top + r.height / 2 };
    };
    setPaths(
      edges.flatMap((e, i): { d: string; kind: Edge["kind"]; on: boolean }[] => {
        const a = pos(e.from);
        const c = pos(e.to);
        if (!a || !c) return [];
        const on = !lit || lit.on.has(i);
        if (e.kind === "dep") {
          // Both ends in the middle column: a loop on its right side.
          const x = Math.max(a.r, c.r);
          return [{ d: `M${a.r} ${a.y} C${x + 60} ${a.y}, ${x + 60} ${c.y}, ${c.r} ${c.y}`, kind: e.kind, on }];
        }
        const mid = (a.r + c.l) / 2;
        return [{ d: `M${a.r} ${a.y} C${mid} ${a.y}, ${mid} ${c.y}, ${c.l} ${c.y}`, kind: e.kind, on }];
      }),
    );
  }, [edges, lit]);

  useLayoutEffect(() => {
    draw();
  }, [draw, useNodes]);
  useEffect(() => {
    // Sticky side columns move while the page scrolls: redraw at most once per frame.
    let frame = 0;
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        draw();
      });
    };
    const ro = new ResizeObserver(schedule);
    if (boxRef.current) ro.observe(boxRef.current);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
    };
  }, [draw]);

  const dim = (id: string) => (lit && !lit.nodes.has(id) ? "opacity-35" : "");
  const sel = (id: string) => (selected === id ? "ring-2 ring-ember" : "");
  const node = "block w-full truncate rounded-lg border bg-paper px-3 py-1.5 text-left text-[13px] transition-opacity hover:bg-paper-2";
  const toggle = (id: string) => onSelect(selected === id ? null : id);
  const fieldsBy = (g: string) => overview.fields.filter((f) => f.group === g);
  const fieldClass = (f: OvField) => (f.calculated ? "border-dashed border-ember/60" : "border-mist");

  return (
    <div ref={boxRef} className="relative grid grid-cols-[minmax(140px,1fr)_minmax(200px,1.6fr)_minmax(140px,1fr)] gap-x-16 rounded-xl border border-mist bg-paper-2 p-4">
      <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h} aria-hidden>
        {paths.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill="none"
            className={p.kind === "dep" ? "stroke-ember" : "stroke-ink-secondary"}
            strokeWidth={p.on && lit ? 1.8 : 1}
            strokeDasharray={p.kind === "dep" ? "4 3" : undefined}
            opacity={lit ? (p.on ? 0.9 : 0.06) : 0.22}
          />
        ))}
      </svg>
      <div className="sticky top-2 self-start space-y-1.5">
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">{t("fieldsManager.sources")}</h3>
        {overview.sources.length === 0 && <p className="text-[12px] text-ink-secondary">{t("fieldsManager.noSources")}</p>}
        {overview.sources.map((s) => (
          <button key={s.id} type="button" data-node={`src:${s.id}`} onClick={() => toggle(`src:${s.id}`)} className={`${node} border-l-4 border-mist border-l-amber-600 ${dim(`src:${s.id}`)} ${sel(`src:${s.id}`)}`}>
            {s.label ?? t(s.labelKey ?? "")}
            {s.autoSync && <span className="ml-1 text-[11px] text-ink-secondary">· {t("fieldsManager.everyHours", { n: String(s.everyHours ?? 1) })}</span>}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {overview.groups.map((g) => (
          <div key={g.id} className="space-y-1.5">
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">{g.label ?? t(g.labelKey ?? "")}</h3>
            {fieldsBy(g.id).map((f) => (
              <button key={f.key} type="button" data-node={`field:${f.key}`} onClick={() => toggle(`field:${f.key}`)} title={f.key} className={`${node} ${fieldClass(f)} ${dim(`field:${f.key}`)} ${sel(`field:${f.key}`)} ${f.active ? "" : "italic text-ink-secondary"}`}>
                {f.label}
                {f.calculated && <span className="float-right text-[11px] text-ember">{t("fieldsManager.calc")}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="sticky top-2 self-start space-y-1.5">
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">{t("fieldsManager.usedIn")}</h3>
        {useNodes.map((u) => (
          <button key={u.id} type="button" data-node={u.id} onClick={() => toggle(u.id)} className={`${node} border-l-4 border-mist border-l-pine ${dim(u.id)} ${sel(u.id)}`}>
            {u.label}
          </button>
        ))}
        {docs === null && <p className="text-[11px] text-ink-secondary">{t("fieldsManager.loadingDocuments")}</p>}
      </div>
    </div>
  );
}
