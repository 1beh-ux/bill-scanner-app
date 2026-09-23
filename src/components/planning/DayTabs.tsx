"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { MoreHorizontal, Plus } from "lucide-react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import type { PlanDayRow, PlanDayTemplateWindow } from "@/lib/planning";
import { DayTemplateWindowsEditor } from "./PlanListDataFields";
import type { DropData, PlanPayload } from "./types";

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const menuItem = "block w-full px-3 py-1.5 text-left text-[13px] text-ink hover:bg-mist disabled:opacity-40";

type Props = {
  eventId: string;
  payload: PlanPayload;
  selectedDayId: string | null;
  onSelect: (dayId: string) => void;
  onPayload: (p: PlanPayload, selectDayId?: string) => void;
  onError: (message: string) => void;
};

export function formatDayDate(date: string | null) {
  if (!date) return "";
  const [, m, d] = date.split("-");
  return `${Number(d)}. ${Number(m)}.`;
}

export default function DayTabs(props: Props) {
  const { t } = useTranslations();
  const confirm = useConfirm();
  const { payload, eventId } = props;
  const [addOpen, setAddOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState<PlanDayRow | null>(null);
  const days = [...payload.days].sort((a, b) => a.sortOrder - b.sortOrder);
  const current = days.find((d) => d.id === props.selectedDayId) ?? null;

  async function call(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      props.onError(t("planBoard.errorSaveFailed"));
      return null;
    }
    return (await res.json()) as PlanPayload;
  }

  async function addDay(source: "previous" | "empty" | { templateId: string }) {
    setAddOpen(false);
    const next = await call(`/api/events/${eventId}/planning/days`, "POST", { source });
    if (next) {
      const newest = [...next.days].sort((a, b) => b.sortOrder - a.sortOrder)[0];
      props.onPayload(next, newest?.id);
    }
  }

  async function deleteDay() {
    setMenuOpen(false);
    if (!current) return;
    if (!(await confirm({ message: t("planBoard.confirmDeleteDay", { day: current.label }), danger: true }))) return;
    const next = await call(`/api/events/${eventId}/planning/days/${current.id}`, "DELETE");
    if (next) props.onPayload(next, next.days[0]?.id);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      {days.map((d) => (
        <DayTab key={d.id} day={d} active={d.id === props.selectedDayId} onClick={() => props.onSelect(d.id)} />
      ))}

      <div className="relative">
        <button
          onClick={() => setAddOpen((o) => !o)}
          className="flex items-center gap-1 rounded-lg border border-dashed border-mist px-3 py-1.5 text-[13px] text-ink-secondary hover:text-ink"
        >
          <Plus size={14} /> {t("planBoard.addDay")}
        </button>
        {addOpen && (
          <Menu onClose={() => setAddOpen(false)}>
            <button className={menuItem} disabled={days.length === 0} onClick={() => addDay("previous")}>
              {t("planBoard.addDayPrevious")}
            </button>
            {payload.dayTemplates.map((tpl) => (
              <button key={tpl.id} className={menuItem} onClick={() => addDay({ templateId: tpl.id })}>
                {t("planBoard.addDayFromTemplate", { name: tpl.name })}
              </button>
            ))}
            <button className={menuItem} onClick={() => addDay("empty")}>
              {t("planBoard.addDayEmpty")}
            </button>
          </Menu>
        )}
      </div>

      {current && (
        <div className="relative ml-auto">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-lg p-1.5 text-ink-secondary hover:bg-mist hover:text-ink"
            aria-label={t("planBoard.dayMenu")}
          >
            <MoreHorizontal size={18} />
          </button>
          {menuOpen && (
            <Menu onClose={() => setMenuOpen(false)} right>
              <button
                className={menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  setEditing(current);
                }}
              >
                {t("planBoard.editDay")}
              </button>
              <button className={menuItem + " text-red-600"} onClick={deleteDay}>
                {t("planBoard.deleteDay")}
              </button>
            </Menu>
          )}
        </div>
      )}

      {editing && <DayEditor {...props} day={editing} onClose={() => setEditing(null)} call={call} />}
    </div>
  );
}

function DayTab({ day, active, onClick }: { day: PlanDayRow; active: boolean; onClick: () => void }) {
  const data: DropData = { type: "daytab", dayId: day.id };
  const { setNodeRef, isOver } = useDroppable({ id: `daytab:${day.id}`, data });
  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      className={
        "rounded-lg px-3 py-1.5 text-[13px] transition-colors " +
        (active ? "bg-ember font-medium text-white" : "bg-paper-2 text-ink hover:bg-mist") +
        (isOver ? " ring-2 ring-ember" : "")
      }
    >
      {day.label}
      {day.date && <span className={"ml-1.5 text-[11px] " + (active ? "text-white/80" : "text-ink-secondary")}>{formatDayDate(day.date)}</span>}
    </button>
  );
}

function Menu({ children, onClose, right }: { children: React.ReactNode; onClose: () => void; right?: boolean }) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className={"absolute top-full z-40 mt-1 min-w-[220px] rounded-lg border border-mist bg-paper py-1 shadow-lg " + (right ? "right-0" : "left-0")}>
        {children}
      </div>
    </>
  );
}

function DayEditor({
  eventId,
  payload,
  day,
  onClose,
  onPayload,
  call,
}: Props & { day: PlanDayRow; onClose: () => void; call: (url: string, method: string, body?: unknown) => Promise<PlanPayload | null> }) {
  const { t } = useTranslations();
  const confirm = useConfirm();
  const [label, setLabel] = useState(day.label);
  const [date, setDate] = useState(day.date ?? "");
  const [windows, setWindows] = useState<PlanDayTemplateWindow[]>(
    payload.windows
      .filter((w) => w.dayId === day.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(({ id, name, startMin, endMin, kind }) => ({ id, name, startMin, endMin, kind }))
  );
  const [templateName, setTemplateName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const valid = windows.every((w) => !w.name.trim() || w.endMin > w.startMin);

  async function save() {
    const kept = windows.filter((w) => w.name.trim());
    // Warn before dropping scheduled activities: removed windows, or windows turned fixed.
    const lost = payload.windows.filter((w) => {
      if (w.dayId !== day.id) return false;
      const next = kept.find((k) => k.id === w.id);
      return (!next || next.kind === "fixed") && payload.slots.some((s) => s.windowId === w.id);
    });
    if (lost.length > 0 && !(await confirm({ message: t("planBoard.confirmDropWindows", { windows: lost.map((w) => w.name).join(", ") }), danger: true }))) {
      return;
    }
    setBusy(true);
    const patched = await call(`/api/events/${eventId}/planning/days/${day.id}`, "PATCH", { label, date: date || null });
    const next = patched && (await call(`/api/events/${eventId}/planning/days/${day.id}/windows`, "PUT", { windows: kept }));
    setBusy(false);
    if (next) {
      onPayload(next);
      onClose();
    }
  }

  async function saveAsTemplate() {
    const name = templateName.trim();
    if (!name) return;
    setBusy(true);
    const res = await fetch(`/api/events/${eventId}/list-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "plan_day_template",
        name,
        data: { windows: windows.filter((w) => w.name.trim()).map(({ name, startMin, endMin, kind }) => ({ name, startMin, endMin, kind })) },
      }),
    });
    setBusy(false);
    setMessage(res.ok ? t("planBoard.templateSaved", { name }) : t("planBoard.errorSaveFailed"));
    if (res.ok) {
      setTemplateName("");
      const fresh = await fetch(`/api/events/${eventId}/planning`);
      if (fresh.ok) onPayload(await fresh.json());
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-lg bg-paper p-5">
        <h2 className="text-[17px] font-semibold text-ink">{t("planBoard.editDay")}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
          <label className="flex flex-col gap-1 text-[12px] text-ink-secondary">
            {t("common.name")}
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-secondary">
            {t("planBoard.date")}
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </label>
        </div>

        <DayTemplateWindowsEditor windows={windows} onChange={setWindows} />
        {!valid && <p className="text-[13px] text-red-600">{t("planBoard.errorWindowTimes")}</p>}

        <div className="flex flex-wrap items-end gap-2 border-t border-mist pt-3">
          <label className="flex flex-1 flex-col gap-1 text-[12px] text-ink-secondary">
            {t("planBoard.saveAsTemplate")}
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder={t("planBoard.templateNamePlaceholder")}
              className={inputClass}
            />
          </label>
          <button
            onClick={saveAsTemplate}
            disabled={busy || !templateName.trim()}
            className="rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[13px] text-ink hover:bg-mist disabled:opacity-50"
          >
            {t("common.save")}
          </button>
        </div>
        {message && <p className="text-[13px] text-ink-secondary">{message}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-[13px] text-ink-secondary hover:underline">
            {t("common.cancel")}
          </button>
          <button onClick={save} disabled={busy || !valid || !label.trim()} className={btnPrimary}>
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
