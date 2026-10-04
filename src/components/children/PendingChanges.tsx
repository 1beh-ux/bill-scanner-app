"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "@/lib/i18n";

export type PendingChange = {
  id: string;
  childId: string;
  childName: string;
  fieldKey: string;
  fieldLabel: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
};

// "Ke schválení": parent edits of `approval` fields (docs/registration-portal-spec.md D),
// old vs new side by side. Shared by the Děti page (all children) and the child detail.
export default function PendingChanges({ changes, showChild, onDecided }: { changes: PendingChange[]; showChild?: boolean; onDecided: () => void }) {
  const { t } = useTranslations();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function decide(c: PendingChange, accept: boolean) {
    setBusy(c.id);
    setError(false);
    const res = await fetch(`/api/children/${c.childId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decide", changeId: c.id, accept }),
    });
    setBusy(null);
    if (!res.ok) setError(true);
    onDecided();
  }

  if (changes.length === 0) return null;
  const show = (c: PendingChange, v: string | null) => {
    if (!v) return "—";
    if (c.fieldKey !== "__guardians") return v; // GUARDIANS_CHANGE_KEY: a JSON list
    const list = JSON.parse(v) as { name: string | null; email: string; phone: string | null; receivesCommunications: boolean }[];
    return list.map((g) => [g.name, g.email, g.phone].filter(Boolean).join(" · ") + (g.receivesCommunications ? "" : " ✉✗")).join(" | ") || "—";
  };
  return (
    <section>
      <h2 className="mb-1 text-[15px] font-semibold text-ink">{t("childProfile.pendingTitle", { count: String(changes.length) })}</h2>
      <p className="mb-2 text-[12.5px] text-ink-secondary">{t("childProfile.pendingHint")}</p>
      {error && <p className="mb-2 text-[13px] text-red-600">{t("children.errorFailed")}</p>}
      <div className="flex flex-col gap-2">
        {changes.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50/60 p-2 text-[13px] dark:bg-transparent">
            {showChild && (
              <Link href={`/children/${c.childId}`} className="min-w-40 font-medium text-ink underline hover:text-ember">
                {c.childName}
              </Link>
            )}
            <span className="min-w-32 text-ink-secondary">{c.fieldLabel}</span>
            <span className="flex flex-1 flex-wrap items-center gap-2">
              <span className="rounded bg-paper-2 px-1.5 py-0.5 text-ink-secondary line-through">{show(c, c.oldValue)}</span>
              <span aria-hidden="true">→</span>
              <span className="rounded bg-pine-bg px-1.5 py-0.5 text-pine">{show(c, c.newValue)}</span>
            </span>
            <span className="flex gap-2">
              <button disabled={busy === c.id} onClick={() => decide(c, true)} className="rounded-lg bg-ember px-3 py-1 text-[13px] font-medium text-white hover:bg-ember-hover disabled:opacity-50">
                {t("childProfile.accept")}
              </button>
              <button disabled={busy === c.id} onClick={() => decide(c, false)} className="rounded-lg border border-mist px-3 py-1 text-[13px] text-ink hover:bg-paper-2 disabled:opacity-50">
                {t("childProfile.reject")}
              </button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
