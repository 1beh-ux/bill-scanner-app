"use client";

import { useState } from "react";
import { MAX_PROFILE_SECTIONS, type ProfileSection } from "@/lib/portal-rules";

// Šablony -> Účastníci: the parent portal profile's own sections after Základní / Podrobné údaje
// (e.g. "Zdravotní údaje", "Výchovné poznámky"). Fields pick theirs in the table below.
type T = (key: string, vars?: Record<string, string>) => string;
const inputClass = "w-full rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btn = "rounded border border-mist px-2 py-1 text-[12px] text-ink hover:bg-paper-2 disabled:opacity-40";

export default function ProfileSectionsEditor({ sections, onSaved, canEdit, t }: { sections: ProfileSection[]; onSaved: (s: ProfileSection[]) => void; canEdit: boolean; t: T }) {
  const [rows, setRows] = useState<{ key?: string; label: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const list = rows ?? sections;
  const move = (i: number, d: number) => setRows(() => { const n = [...list]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });

  async function save() {
    setBusy(true);
    setError(false);
    const res = await fetch("/api/organizations/profile-sections", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sections: list }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(true);
    onSaved((await res.json()).sections);
    setRows(null);
  }

  return (
    <section className="mb-6 rounded-lg border border-mist bg-paper-2 p-4">
      <h3 className="text-[15px] font-semibold text-ink">{t("profileSections.title")}</h3>
      <p className="mb-3 text-[12.5px] text-ink-secondary">{t("profileSections.hint")}</p>
      <ol className="flex max-w-xl flex-col gap-2">
        <li className="text-[13px] text-ink-secondary">1. {t("portal.basicTitle")} · 2. {t("portal.detailedTitle")} <span className="text-[11.5px]">({t("profileSections.builtIn")})</span></li>
        {list.map((s, i) => (
          <li key={s.key ?? `new-${i}`} className="flex items-center gap-2">
            <span className="w-5 text-right text-[13px] text-ink-secondary">{i + 3}.</span>
            <input value={s.label} disabled={!canEdit} maxLength={80} onChange={(e) => setRows(list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className={inputClass} />
            {canEdit && (
              <>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={btn} aria-label="↑">↑</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} className={btn} aria-label="↓">↓</button>
                <button type="button" onClick={() => setRows(list.filter((_, j) => j !== i))} className={btn + " text-red-700"}>{t("portal.remove")}</button>
              </>
            )}
          </li>
        ))}
      </ol>
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {list.length < MAX_PROFILE_SECTIONS && (
            <button type="button" onClick={() => setRows([...list, { label: "" }])} className="text-[13px] text-ember hover:underline">
              + {t("profileSections.add")}
            </button>
          )}
          {rows && (
            <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-ember px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ember-hover disabled:opacity-50">
              {t("common.save")}
            </button>
          )}
          {error && <span className="text-[13px] text-red-600">{t("appearance.failed")}</span>}
        </div>
      )}
    </section>
  );
}
