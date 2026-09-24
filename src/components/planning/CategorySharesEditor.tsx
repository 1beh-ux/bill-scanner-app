"use client";

import { X } from "lucide-react";
import { useTranslations } from "@/lib/i18n";

// Categories with optional minutes, main and secondary separately. `key` is a
// category id (event lists) or a name (org base library) -- the editor doesn't
// care. Empty minutes = the whole duration (see categoryMinutes()).
export type CategoryOption = { key: string; name: string; group: "primary" | "secondary" };
export type CategoryValue = { key: string; minutes: number | null };

const inputClass =
  "rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";

export default function CategorySharesEditor({
  options,
  value,
  onChange,
  durationMin,
}: {
  options: CategoryOption[];
  value: CategoryValue[];
  onChange: (next: CategoryValue[]) => void;
  durationMin?: number;
}) {
  const { t } = useTranslations();
  const groupOf = (key: string) => options.find((o) => o.key === key)?.group;

  return (
    <div className="flex flex-col gap-3">
      {(["primary", "secondary"] as const).map((group) => {
        const chosen = value.filter((v) => groupOf(v.key) === group);
        const free = options.filter((o) => o.group === group && !value.some((v) => v.key === o.key));
        const assigned = chosen.reduce((n, v) => n + (v.minutes ?? 0), 0);
        return (
          <div key={group} className="flex flex-col gap-1.5 text-[12px] text-ink-secondary">
            {t(group === "primary" ? "planLists.primaryCategoriesLabel" : "planLists.secondaryCategoriesLabel")}
            {chosen.map((v) => (
              <div key={v.key} className="flex items-center gap-2 text-[13px] text-ink">
                <span className="min-w-0 flex-1 truncate">{options.find((o) => o.key === v.key)?.name ?? "—"}</span>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={v.minutes ?? ""}
                  placeholder={t("planBoard.categoryWhole")}
                  onChange={(e) =>
                    onChange(value.map((x) => (x.key === v.key ? { ...x, minutes: e.target.value ? Math.max(1, Number(e.target.value)) : null } : x)))
                  }
                  className={inputClass + " w-20"}
                  aria-label={t("planBoard.categoryMinutes")}
                />
                <span className="text-[12px] text-ink-secondary">min</span>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((x) => x.key !== v.key))}
                  className="rounded p-1 text-ink-secondary hover:bg-mist hover:text-red-600"
                  aria-label={t("common.delete")}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            {free.length > 0 && (
              <select
                value=""
                onChange={(e) => e.target.value && onChange([...value, { key: e.target.value, minutes: null }])}
                className={inputClass + " self-start"}
              >
                <option value="">{t("planBoard.categoryAdd")}</option>
                {free.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
            {durationMin !== undefined && assigned > 0 && (
              <span className={assigned > durationMin ? "text-red-600" : ""}>
                {t("planBoard.categorySplit", { assigned: String(assigned), duration: String(durationMin) })}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
