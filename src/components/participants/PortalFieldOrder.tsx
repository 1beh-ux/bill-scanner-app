"use client";

import { useEffect, useState } from "react";
import { PROFILE_CATEGORY_KEY, sectionOf, type ProfileCategory, type ProfileSection } from "@/lib/portal-rules";

// Šablony -> Účastníci -> "Pořadí polí pro rodiče" (2026-10-23): every field parents see, by profile
// part, in the order the portal profile, the public form and the registration step show them. Move a
// field up / down or into another part (e.g. all the address fields together in "Adresa").
type T = (key: string, vars?: Record<string, string>) => string;
// show: only the "Cenová kategorie" row (not a field: the categories of the person's registrations).
type Tpl = { key: string; label: string; active: boolean; portalAccess: string; level: "basic" | "detailed"; profileSection: string | null; portalSortOrder: number | null; show?: boolean };
const btn = "rounded border border-mist px-2 py-0.5 text-[12px] text-ink hover:bg-paper-2 disabled:opacity-30";

export default function PortalFieldOrder({ sections, t }: { sections: ProfileSection[]; t: T }) {
  const [rows, setRows] = useState<Tpl[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      fetch("/api/participant-field-templates").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/participant-field-templates/order").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([all, saved]: [Tpl[], { category: ProfileCategory } | null]) => {
        const c = saved?.category ?? { show: false, section: "basic", order: 9999 };
        const category: Tpl = {
          key: PROFILE_CATEGORY_KEY,
          label: t("fieldOrder.categoryRow"),
          active: true,
          portalAccess: "read",
          level: c.section === "detailed" ? "detailed" : "basic",
          profileSection: c.section.startsWith("s") ? c.section : null,
          portalSortOrder: c.order,
          show: c.show,
        };
        setRows(
          [...all.filter((x) => x.active && x.portalAccess !== "hidden"), category].sort(
            (a, b) => (a.portalSortOrder ?? 1e9) - (b.portalSortOrder ?? 1e9) || a.label.localeCompare(b.label, "cs")
          )
        );
      })
      .catch(() => setRows([]));
  }, [open, t]);

  const parts = [
    { key: "basic", label: t("portal.basicTitle") },
    { key: "detailed", label: t("portal.detailedTitle") },
    ...sections.map((s) => ({ key: s.key, label: s.label })),
  ];
  const partOf = (r: Tpl) => sectionOf(r, sections);
  // Moving within a part: swap with the neighbour of the same part.
  function move(key: string, d: -1 | 1) {
    if (!rows) return;
    const i = rows.findIndex((r) => r.key === key);
    const same = rows.map((r, j) => [r, j] as const).filter(([r]) => partOf(r) === partOf(rows[i]));
    const at = same.findIndex(([, j]) => j === i);
    const other = same[at + d];
    if (!other) return;
    const next = [...rows];
    [next[i], next[other[1]]] = [next[other[1]], next[i]];
    setRows(next);
    setDirty(true);
  }
  function setPart(key: string, part: string) {
    // The category row isn't a field with a level: it may go to Základní or Podrobné údaje too.
    setRows(rows!.map((r) => (r.key === key ? { ...r, profileSection: part === "basic" || part === "detailed" ? null : part, ...(r.key === PROFILE_CATEGORY_KEY && (part === "basic" || part === "detailed") && { level: part }) } : r)));
    setDirty(true);
  }
  async function save() {
    setBusy(true);
    setMessage(null);
    // Saved in the shown order: part by part, so the order inside each part is what's on screen.
    const ordered = parts.flatMap((p) => rows!.filter((r) => partOf(r) === p.key));
    const res = await fetch("/api/participant-field-templates/order", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: ordered.map((r) => (r.key === PROFILE_CATEGORY_KEY ? { key: r.key, profileSection: partOf(r), show: !!r.show } : { key: r.key, profileSection: r.profileSection })) }) }).catch(() => null);
    setBusy(false);
    setMessage(t(res?.ok ? "appearance.saved" : "appearance.failed"));
    if (res?.ok) setDirty(false);
  }

  return (
    <section className="mb-6 rounded-lg border border-mist bg-paper-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-ink">{t("fieldOrder.title")}</h3>
        <button type="button" onClick={() => setOpen(!open)} className="text-[13px] text-ember hover:underline">
          {t(open ? "common.close" : "fieldOrder.open")}
        </button>
      </div>
      <p className="text-[12.5px] text-ink-secondary">{t("fieldOrder.hint")}</p>
      {open && rows && (
        <div className="mt-3 flex flex-col gap-4">
          {parts.map((p) => {
            const mine = rows.filter((r) => partOf(r) === p.key);
            return (
              <div key={p.key}>
                <p className="mb-1 text-[13px] font-semibold text-ink">{p.label}</p>
                {mine.length === 0 && <p className="text-[12px] text-ink-secondary">—</p>}
                <ol className="flex flex-col gap-1">
                  {mine.map((r, i) => (
                    <li key={r.key} className="flex flex-wrap items-center gap-2 rounded border border-mist bg-paper px-2 py-1 text-[13.5px] text-ink">
                      <span className="w-5 text-right text-ink-secondary">{i + 1}.</span>
                      <span className="min-w-0 flex-1">{r.label}</span>
                      {r.key === PROFILE_CATEGORY_KEY && (
                        <label className="flex items-center gap-1 text-[12px] text-ink-secondary">
                          <input
                            type="checkbox"
                            checked={!!r.show}
                            onChange={(e) => {
                              setRows(rows.map((x) => (x.key === r.key ? { ...x, show: e.target.checked } : x)));
                              setDirty(true);
                            }}
                          />
                          {t("fieldOrder.categoryShow")}
                        </label>
                      )}
                      <button type="button" onClick={() => move(r.key, -1)} disabled={i === 0} className={btn} aria-label="↑">↑</button>
                      <button type="button" onClick={() => move(r.key, 1)} disabled={i === mine.length - 1} className={btn} aria-label="↓">↓</button>
                      <select value={p.key} onChange={(e) => setPart(r.key, e.target.value)} className="rounded border border-mist bg-paper-2 px-1.5 py-0.5 text-[12px]" aria-label={t("profileSections.column")}>
                        {parts.map((x) => (
                          <option key={x.key} value={x.key} disabled={r.key !== PROFILE_CATEGORY_KEY && ((x.key === "basic" && r.level !== "basic") || (x.key === "detailed" && r.level !== "detailed"))}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
          <div className="flex items-center gap-3">
            <button type="button" onClick={save} disabled={busy || !dirty} className="rounded-lg bg-ember px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ember-hover disabled:opacity-50">
              {t("common.save")}
            </button>
            {message && <span className="text-[13px] text-ink">{message}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
