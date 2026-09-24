"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import CategorySharesEditor from "./CategorySharesEditor";
import {
  ENERGY_LEVELS,
  baseActivityCategories,
  type PlanBaseActivityData,
  PLAN_WINDOW_KINDS,
  hhmmToMinutes,
  minutesToHhmm,
  type PlanDayTemplateWindow,
  type PlanWindowKind,
} from "@/lib/planning";

export type PlanKind = "plan_category" | "plan_location" | "plan_leader" | "plan_day_template" | "plan_activity";
type Data = Record<string, unknown>;

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const labelClass = "flex flex-col gap-1 text-[12px] text-ink-secondary";

// Kind-specific `data` fields for the Planning list kinds inside ListTemplateAdmin.
// Kept as one loose Record rather than a useState per field (the older kinds'
// pattern) -- five kinds x several fields would otherwise swamp that component.
export default function PlanListDataFields({
  kind,
  data,
  onChange,
  fixedGroup,
}: {
  kind: PlanKind;
  data: Data;
  onChange: (next: Data) => void;
  fixedGroup?: boolean; // category group decided by the list it's in
}) {
  const { t } = useTranslations();
  const set = (key: string, value: unknown) => onChange({ ...data, [key]: value === "" ? undefined : value });
  const str = (key: string) => (data[key] === undefined || data[key] === null ? "" : String(data[key]));
  const num = (value: string) => (value === "" ? undefined : Number(value));

  if (kind === "plan_category") {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {!fixedGroup && (
          <label className={labelClass}>
            {t("planLists.categoryGroup")}
            <select value={str("group") || "primary"} onChange={(e) => set("group", e.target.value)} className={inputClass}>
              <option value="primary">{t("planLists.groupPrimary")}</option>
              <option value="secondary">{t("planLists.groupSecondary")}</option>
            </select>
          </label>
        )}
        <label className={labelClass}>
          {t("planLists.color")}
          <input
            type="color"
            value={str("color") || "#9ca3af"}
            onChange={(e) => set("color", e.target.value)}
            className="h-[38px] w-full rounded-lg border border-mist bg-paper-2"
          />
        </label>
        <label className={labelClass}>
          {t("planLists.targetPercent")}
          <input
            type="number"
            min={0}
            max={100}
            value={str("targetPercent")}
            onChange={(e) => set("targetPercent", num(e.target.value))}
            className={inputClass}
          />
        </label>
        {(str("group") || "primary") === "primary" && (
          <label className="flex items-center gap-2 text-[13px] text-ink-secondary sm:col-span-3">
            <input
              type="checkbox"
              checked={data.countInAnalysis !== false}
              onChange={(e) => onChange({ ...data, countInAnalysis: e.target.checked })}
            />
            {t("planLists.countInAnalysis")}
          </label>
        )}
      </div>
    );
  }

  if (kind === "plan_location") {
    return (
      <>
        <input
          type="number"
          min={0}
          placeholder={t("planLists.capacity")}
          value={str("capacity")}
          onChange={(e) => set("capacity", num(e.target.value))}
          className={inputClass}
        />
        <input
          type="text"
          placeholder={t("planLists.notes")}
          value={str("notes")}
          onChange={(e) => set("notes", e.target.value)}
          className={inputClass}
        />
      </>
    );
  }

  if (kind === "plan_leader") {
    return (
      <>
        <input
          type="text"
          placeholder={t("planLists.role")}
          value={str("role")}
          onChange={(e) => set("role", e.target.value)}
          className={inputClass}
        />
        <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
          <input
            type="color"
            value={str("color") || "#9ca3af"}
            onChange={(e) => set("color", e.target.value)}
            className="h-[34px] w-12 rounded-lg border border-mist bg-paper-2"
          />
          {t("planLists.leaderColor")}
        </label>
        <input
          type="tel"
          placeholder={t("planLists.phone")}
          value={str("phone")}
          onChange={(e) => set("phone", e.target.value)}
          className={inputClass}
        />
        <input
          type="text"
          placeholder={t("planLists.notes")}
          value={str("notes")}
          onChange={(e) => set("notes", e.target.value)}
          className={inputClass}
        />
      </>
    );
  }

  if (kind === "plan_day_template") {
    return <DayTemplateWindowsEditor windows={(data.windows as PlanDayTemplateWindow[]) ?? []} onChange={(w) => set("windows", w)} />;
  }

  return <BaseActivityFields data={data} set={set} str={str} num={num} />;
}

function BaseActivityFields({
  data,
  set,
  str,
  num,
}: {
  data: Data;
  set: (key: string, value: unknown) => void;
  str: (key: string) => string;
  num: (value: string) => number | undefined;
}) {
  const { t } = useTranslations();
  const [categories, setCategories] = useState<{ name: string; data: { group?: string } | null }[]>([]);

  useEffect(() => {
    fetch("/api/list-templates?kind=plan_category")
      .then((r) => (r.ok ? r.json() : []))
      .then(setCategories);
  }, []);

  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className={labelClass}>
          {t("planLists.durationMin")}
          <input
            type="number"
            min={5}
            step={5}
            value={str("defaultDurationMin")}
            onChange={(e) => set("defaultDurationMin", num(e.target.value))}
            className={inputClass}
          />
        </label>
      </div>
      {/* Org templates reference categories by name (resolved per event on import). */}
      <CategorySharesEditor
        options={categories.map((c) => ({ key: c.name, name: c.name, group: c.data?.group === "secondary" ? "secondary" : "primary" }))}
        value={baseActivityCategories(data as PlanBaseActivityData).map((c) => ({ key: c.name, minutes: c.minutes }))}
        onChange={(next) => set("categories", next.map((c) => ({ name: c.key, minutes: c.minutes })))}
        durationMin={typeof data.defaultDurationMin === "number" ? data.defaultDurationMin : undefined}
      />
      <textarea
        placeholder={t("planLists.description")}
        value={str("description")}
        onChange={(e) => set("description", e.target.value)}
        className={inputClass}
        rows={2}
      />
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
          {t("planLists.energyLevel")}
          <select value={str("energyLevel")} onChange={(e) => set("energyLevel", e.target.value)} className={inputClass + " w-auto"}>
            <option value="">—</option>
            {ENERGY_LEVELS.map((level) => (
              <option key={level} value={level}>
                {t(`planLists.energy.${level}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
          <input type="checkbox" checked={Boolean(data.repeatable)} onChange={(e) => set("repeatable", e.target.checked)} />
          {t("planLists.repeatable")}
        </label>
      </div>
    </>
  );
}

export function DayTemplateWindowsEditor({
  windows,
  onChange,
}: {
  windows: PlanDayTemplateWindow[];
  onChange: (next: PlanDayTemplateWindow[]) => void;
}) {
  const { t } = useTranslations();
  const update = (idx: number, patch: Partial<PlanDayTemplateWindow>) =>
    onChange(windows.map((w, i) => (i === idx ? { ...w, ...patch } : w)));
  const last = windows[windows.length - 1];

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] text-ink-secondary">{t("planLists.windowsLabel")}</p>
      {windows.map((w, idx) => (
        <div key={idx} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2">
          <input
            type="text"
            placeholder={t("common.name")}
            value={w.name}
            onChange={(e) => update(idx, { name: e.target.value })}
            className={inputClass}
          />
          <input
            type="time"
            value={minutesToHhmm(w.startMin)}
            onChange={(e) => update(idx, { startMin: hhmmToMinutes(e.target.value) ?? w.startMin })}
            className={inputClass}
          />
          <input
            type="time"
            value={minutesToHhmm(w.endMin)}
            onChange={(e) => update(idx, { endMin: hhmmToMinutes(e.target.value) ?? w.endMin })}
            className={inputClass}
          />
          <select value={w.kind} onChange={(e) => update(idx, { kind: e.target.value as PlanWindowKind })} className={inputClass}>
            {PLAN_WINDOW_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`planLists.windowKind.${k}`)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onChange(windows.filter((_, i) => i !== idx))}
            className="text-[13px] text-red-600 hover:underline"
            aria-label={t("common.delete")}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([
            ...windows,
            // New row continues where the last window ended.
            { name: "", startMin: last?.endMin ?? 9 * 60, endMin: (last?.endMin ?? 9 * 60) + 60, kind: "flexible" },
          ])
        }
        className="self-start text-[13px] text-ember hover:underline"
      >
        {t("planLists.addWindow")}
      </button>
    </div>
  );
}
