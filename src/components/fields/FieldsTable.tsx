"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import type { FmOverview, OvField } from "./types";

// Round 2 (2026-11-23): the list view of the Fields screen is the "Kde se používá" table, editable in place --
// switches for yes/no, drop-downs for choices, a filter per column (Excel-like), row selection and one change
// for all selected rows. Single changes go through onPatch (saved at once, undo in the bar).
type Patch = (key: string, body: Record<string, unknown>, undo?: Record<string, unknown>) => Promise<boolean>;
type Col = {
  id: string;
  label: string;
  value: (f: OvField) => string; // what the filter compares
  can: (f: OvField) => boolean; // editable for this field
  body?: (f: OvField, v: string) => Record<string, unknown>; // the PATCH for a new value
  options?: { value: string; label: string }[]; // drop-down; absent = yes/no switch
};
const USES = ["lists", "health", "mail", "email", "documents", "import"] as const;
const usesOn = (f: OvField, u: string) => (u === "lists" ? f.surfaces.includes("list") : u === "health" ? f.surfaces.some((s) => s.startsWith("health")) : u === "mail" ? f.surfaces.includes("mail_list") : f.surfaces.includes(u));

export default function FieldsTable({ overview, selected, onSelect, onPatch, onChanged }: { overview: FmOverview; selected: string | null; onSelect: (id: string) => void; onPatch: Patch; onChanged: () => void }) {
  const { t } = useTranslations();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<{ col: string; value: string }>({ col: "", value: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const yes = t("fieldsManager.yes");
  const no = t("fieldsManager.no");
  const yn = (b: boolean) => (b ? "1" : "0");
  const groupLabel = (id: string) => {
    const g = overview.groups.find((x) => x.id === id);
    return g ? (g.label ?? t(g.labelKey ?? "")) : id;
  };
  const tmpl = (f: OvField) => f.fromTemplate && !f.calculated;
  const cols: Col[] = useMemo(
    () => [
      { id: "group", label: t("fieldsManager.group"), value: (f) => f.group, can: () => false },
      { id: "type", label: t("fieldsManager.panel.type"), value: (f) => f.fieldType, can: () => false },
      { id: "profile", label: t("fieldsManager.panel.toProfile"), value: (f) => yn(f.storage === "profile"), can: tmpl, body: (_f, v) => ({ storage: v === "1" ? "profile" : "event" }) },
      { id: "required", label: t("fieldsManager.required"), value: (f) => yn(f.required || f.system), can: (f) => f.kind === "custom" && !f.locked, body: (_f, v) => ({ required: v === "1" }) },
      { id: "locked", label: t("fieldsManager.panel.lockedShort"), value: (f) => yn(f.locked || f.system), can: (f) => f.fromTemplate && !f.system, body: (_f, v) => ({ locked: v === "1" }) },
      ...USES.map((u): Col => ({ id: u, label: t(`fieldsManager.use.${u}`), value: (f) => yn(usesOn(f, u)), can: (f) => !(u === "import" && f.calculated), body: (_f, v) => ({ surface: { use: u, on: v === "1" } }) })),
      {
        id: "portal",
        label: t("fieldsManager.portal"),
        value: (f) => f.portalAccess ?? "",
        can: (f) => f.fromTemplate,
        body: (_f, v) => ({ portalAccess: v }),
        options: ["edit", "approval", "read", "hidden"].map((a) => ({ value: a, label: t(`fieldsManager.portalAccess.${a}`) })),
      },
      {
        id: "level",
        label: t("fieldsManager.panel.level"),
        value: (f) => f.level ?? "",
        can: (f) => f.fromTemplate && !!f.portalAccess && f.portalAccess !== "hidden",
        body: (_f, v) => ({ level: v }),
        options: [
          { value: "basic", label: t("fieldsManager.groupBasic") },
          { value: "detailed", label: t("fieldsManager.groupDetailed") },
        ],
      },
    ],
    [t],
  );
  const needle = q.trim().toLocaleLowerCase("cs");
  const rows = overview.fields.filter(
    (f) => (!needle || f.label.toLocaleLowerCase("cs").includes(needle) || f.key.toLowerCase().includes(needle)) && cols.every((c) => !filters[c.id] || c.value(f) === filters[c.id]),
  );
  const shownText = (c: Col, v: string) => (c.options ? (c.options.find((o) => o.value === v)?.label ?? (v || "—")) : c.id === "group" ? groupLabel(v) : c.id === "type" ? t(`fieldsManager.type.${v}`) : v === "1" ? yes : no);
  const distinct = (c: Col) => [...new Set(overview.fields.map(c.value))].sort();
  const allPicked = rows.length > 0 && rows.every((f) => picked.has(f.key));
  const bulkCol = cols.find((c) => c.id === bulk.col);

  async function applyBulk() {
    if (!bulkCol?.body || bulk.value === "") return;
    let done = 0;
    let skipped = 0;
    for (const key of picked) {
      const f = overview.fields.find((x) => x.key === key);
      if (!f || !bulkCol.can(f) || bulkCol.value(f) === bulk.value) {
        skipped++;
        continue;
      }
      const res = await fetch(`/api/fields/${encodeURIComponent(key)}?event=${encodeURIComponent(overview.eventId ?? "")}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bulkCol.body(f, bulk.value)) }).catch(() => null);
      if (res?.ok) done++;
      else skipped++;
    }
    setMsg(t("fieldsManager.table.bulkDone", { n: String(done), skipped: String(skipped) }));
    onChanged();
  }

  const cell = (f: OvField, c: Col) => {
    const v = c.value(f);
    if (!c.can(f) || !c.body) return <span className={c.options || c.id === "group" || c.id === "type" ? "" : v === "1" ? "text-pine" : "text-mist"}>{c.options || c.id === "group" || c.id === "type" ? shownText(c, v) : v === "1" ? "●" : "○"}</span>;
    if (c.options)
      return (
        <select value={v} onChange={(e) => onPatch(f.key, c.body!(f, e.target.value), c.body!(f, v))} className="rounded border border-mist bg-paper px-1 py-0.5 text-[12px]">
          {c.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    return <input type="checkbox" checked={v === "1"} onChange={(e) => onPatch(f.key, c.body!(f, yn(e.target.checked)), c.body!(f, v))} aria-label={c.label} />;
  };
  const th = "px-1.5 py-1 text-left text-[11px] font-semibold text-ink-secondary align-bottom";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("fieldsManager.search")} className="rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px]" />
        {Object.values(filters).some(Boolean) && (
          <button type="button" onClick={() => setFilters({})} className="text-[12px] text-ember hover:underline">{t("fieldsManager.table.clearFilters")}</button>
        )}
        <span className="text-[12px] text-ink-secondary">{t("fieldsManager.table.count", { n: String(rows.length), all: String(overview.fields.length) })}</span>
      </div>
      {picked.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ember/50 bg-paper p-2 text-[13px]">
          <span className="font-medium">{t("fieldsManager.table.selected", { n: String(picked.size) })}</span>
          <select value={bulk.col} onChange={(e) => setBulk({ col: e.target.value, value: "" })} className="rounded border border-mist bg-paper px-2 py-1">
            <option value="">{t("fieldsManager.table.setWhat")}</option>
            {cols.filter((c) => c.body).map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          {bulkCol && (
            <select value={bulk.value} onChange={(e) => setBulk({ ...bulk, value: e.target.value })} className="rounded border border-mist bg-paper px-2 py-1">
              <option value="">—</option>
              {(bulkCol.options ?? [{ value: "1", label: yes }, { value: "0", label: no }]).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
          <button type="button" disabled={!bulkCol || bulk.value === ""} onClick={applyBulk} className="rounded-lg bg-ember px-3 py-1 text-white disabled:opacity-40">{t("fieldsManager.table.apply")}</button>
          <button type="button" onClick={() => setPicked(new Set())} className="text-[12px] text-ink-secondary hover:underline">{t("fieldsManager.cancel")}</button>
          {msg && <span className="text-ink-secondary">{msg}</span>}
        </div>
      )}
      <div className="max-h-[75vh] overflow-auto rounded-xl border border-mist bg-paper">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-paper-2">
            <tr>
              <th className={th}>
                <input type="checkbox" checked={allPicked} onChange={(e) => setPicked(e.target.checked ? new Set([...picked, ...rows.map((f) => f.key)]) : new Set([...picked].filter((k) => !rows.some((f) => f.key === k))))} aria-label={t("fieldsManager.table.selectAll")} />
              </th>
              <th className={th}>{t("fieldsManager.field")}</th>
              {cols.map((c) => (
                <th key={c.id} className={th}>
                  <div>{c.label}</div>
                  <select value={filters[c.id] ?? ""} onChange={(e) => setFilters({ ...filters, [c.id]: e.target.value })} className={`mt-0.5 max-w-[110px] rounded border px-0.5 text-[11px] font-normal ${filters[c.id] ? "border-ember" : "border-mist"} bg-paper`} aria-label={`${c.label} – filtr`}>
                    <option value="">{t("fieldsManager.table.all")}</option>
                    {distinct(c).map((v) => (
                      <option key={v} value={v}>{shownText(c, v)}</option>
                    ))}
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.key} className={`border-t border-mist ${selected === `field:${f.key}` ? "bg-paper-2" : ""} ${f.active ? "" : "text-ink-secondary"}`}>
                <td className="px-1.5 py-1">
                  <input type="checkbox" checked={picked.has(f.key)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(f.key); else n.delete(f.key); return n; })} aria-label={f.label} />
                </td>
                <td className="px-1.5 py-1">
                  <button type="button" onClick={() => onSelect(`field:${f.key}`)} className={`text-left hover:underline ${f.calculated ? "decoration-dashed" : ""}`}>
                    {f.label} {(f.system || f.locked) && <span title={t(f.system ? "fieldsManager.panel.system" : "fieldsManager.panel.locked")}>🔒</span>}
                  </button>
                  <div className="font-mono text-[11px] text-ink-secondary">{`{{${f.key}}}`}</div>
                </td>
                {cols.map((c) => (
                  <td key={c.id} className="px-1.5 py-1 text-center">{cell(f, c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
