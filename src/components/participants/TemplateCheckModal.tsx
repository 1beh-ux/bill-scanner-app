"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";

type Placeholder = { key: string; status: "ok" | "field_off" | "unknown" | "invalid"; hasSpaces: boolean };
type CheckResult = {
  templates: { docTypeId: string; name: string; error?: string; placeholders: Placeholder[] }[];
  unusedFields: { key: string; label: string }[];
};

const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

// Compares the {{placeholders}} in every document template with the event's
// participant fields (src/lib/template-check.ts) and offers to add what's
// missing in one go.
export default function TemplateCheckModal({
  eventId,
  onClose,
  onApplied,
}: {
  eventId: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { t } = useTranslations();
  const [result, setResult] = useState<CheckResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<{ enabled: number; created: number } | null>(null);

  function load() {
    fetch(`/api/events/${eventId}/template-check`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: CheckResult) => {
        setResult(data);
        // Everything addable starts ticked -- "add all missing" is the common case.
        setSelected(
          new Set(data.templates.flatMap((tpl) => tpl.placeholders.filter((p) => p.status === "field_off" || p.status === "unknown").map((p) => p.key)))
        );
      })
      .catch(() => setFailed(true));
  }

  useEffect(load, [eventId]);

  const addable = result
    ? [...new Map(result.templates.flatMap((tpl) => tpl.placeholders).filter((p) => p.status === "field_off" || p.status === "unknown").map((p) => [p.key, p])).values()]
    : [];

  async function apply() {
    setApplying(true);
    const res = await fetch(`/api/events/${eventId}/template-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: [...selected] }),
    });
    setApplying(false);
    if (res.ok) {
      setApplied(await res.json());
      onApplied();
      setResult(null);
      load();
    }
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-y-auto rounded-lg bg-paper p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-ink">{t("templateCheck.title")}</h2>
          <button onClick={onClose} className="text-[13px] text-ink-secondary hover:underline">
            {t("common.close")}
          </button>
        </div>

        {failed && <p className="text-[14px] text-red-600">{t("templateCheck.failed")}</p>}
        {!result && !failed && <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>}

        {result && result.templates.length === 0 && (
          <p className="text-[14px] text-ink-secondary">{t("templateCheck.noTemplates")}</p>
        )}

        {result?.templates.map((tpl) => (
          <div key={tpl.docTypeId} className="mb-4">
            <p className="mb-1 text-[14px] font-medium text-ink">{tpl.name}</p>
            {tpl.error ? (
              <p className="text-[13px] text-red-600">{t("templateCheck.readFailed")}</p>
            ) : tpl.placeholders.length === 0 ? (
              <p className="text-[13px] text-ink-secondary">{t("templateCheck.noPlaceholders")}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {tpl.placeholders.map((p) => (
                  <li key={p.key} className="flex items-center gap-2 text-[13px]">
                    {p.status === "field_off" || p.status === "unknown" ? (
                      <input type="checkbox" checked={selected.has(p.key)} onChange={() => toggle(p.key)} />
                    ) : (
                      <span className={p.status === "ok" ? "w-[13px] text-pine" : "w-[13px] text-red-600"}>{p.status === "ok" ? "✓" : "✗"}</span>
                    )}
                    <code className="text-ink">{`{{${p.key}}}`}</code>
                    <span className="text-ink-secondary">{t(`templateCheck.status.${p.status}`)}</span>
                    {p.hasSpaces && <span className="text-amber-700">{t("templateCheck.hasSpaces")}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {result && result.unusedFields.length > 0 && (
          <div className="mb-4 border-t border-mist pt-3">
            <p className="mb-1 text-[13px] font-medium text-ink">{t("templateCheck.unusedTitle")}</p>
            <p className="text-[13px] text-ink-secondary">{result.unusedFields.map((f) => f.label).join(", ")}</p>
          </div>
        )}

        {applied && (
          <p className="mb-3 text-[13px] text-pine">
            {t("templateCheck.applied", { enabled: String(applied.enabled), created: String(applied.created) })}
          </p>
        )}

        {addable.length > 0 && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-ink-secondary">{t("templateCheck.addHint")}</p>
            <button onClick={apply} disabled={applying || selected.size === 0} className={btnPrimary + " shrink-0"}>
              {applying ? t("common.loading") : t("templateCheck.addSelected", { count: String(selected.size) })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
