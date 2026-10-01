"use client";

import { useEffect, useState } from "react";
import { GripVertical, X } from "lucide-react";
import { useTranslations } from "@/lib/i18n";
import { HEALTH_NOTE_PLACES, type HealthNoteConfig, type HealthNotePlace } from "@/lib/health-notes";

const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

// Nastavení akce -> Zdraví -> Zdravotní poznámky: which fields are the
// important health notes, their order (drag rows), where each one shows, and
// which are highlighted (⚠ badge in the Zdraví list, always visible when
// logging an incident, red in the detail and the parent PDF).
export default function HealthNotesSettings({ eventId }: { eventId: string }) {
  const { t } = useTranslations();
  const [config, setConfig] = useState<HealthNoteConfig[]>([]);
  const [fields, setFields] = useState<{ key: string; label: string; kind: string }[]>([]);
  const [isDefault, setIsDefault] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/events/${eventId}/health-notes`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setConfig(d.config);
        setFields(d.fields);
        setIsDefault(d.isDefault);
      })
      .finally(() => setLoading(false));
  }, [eventId]);

  const labelOf = (key: string) => fields.find((f) => f.key === key)?.label ?? key;
  const edit = (next: HealthNoteConfig[]) => {
    setConfig(next);
    setStatus(null);
  };
  const toggle = (i: number, place: HealthNotePlace) =>
    edit(config.map((c, j) => (j !== i ? c : { ...c, places: c.places.includes(place) ? c.places.filter((p) => p !== place) : [...c.places, place] })));
  function drop(target: number) {
    if (dragIndex === null || dragIndex === target) return;
    const next = [...config];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(target, 0, moved);
    setDragIndex(null);
    edit(next);
  }

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/events/${eventId}/health-notes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    setSaving(false);
    setStatus(res.ok ? { text: t("settingsPage.saved"), ok: true } : { text: t("listTemplateAdmin.errorSaveFailed"), ok: false });
    if (res.ok) setIsDefault(false);
  }

  if (loading) return <p className="text-[13px] text-ink-secondary">{t("common.loading")}</p>;
  const available = fields.filter((f) => !config.some((c) => c.fieldKey === f.key));

  return (
    <div>
      <h3 className="mb-1 text-[15px] font-semibold text-ink">{t("healthNotes.title")}</h3>
      <p className="mb-3 text-[12px] text-ink-secondary">
        {t("healthNotes.hint")} {isDefault && t("healthNotes.defaultHint")}
      </p>
      <div className="scrollbar-app overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-mist text-left text-[11px] uppercase tracking-wide text-ink-secondary">
              <th className="w-6 p-1.5"></th>
              <th className="p-1.5 font-medium">{t("healthNotes.colField")}</th>
              {HEALTH_NOTE_PLACES.map((p) => (
                <th key={p} className="p-1.5 text-center font-medium">
                  {t(`healthNotes.place.${p}`)}
                </th>
              ))}
              <th className="p-1.5 text-center font-medium">{t("healthNotes.highlight")}</th>
              <th className="w-6 p-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {config.map((c, i) => (
              <tr
                key={c.fieldKey}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drop(i)}
                className={"border-b border-mist/60 " + (dragIndex === i ? "opacity-50" : "")}
              >
                <td className="cursor-grab p-1.5 text-ink-secondary" title={t("healthNotes.dragHint")}>
                  <GripVertical size={14} aria-hidden="true" />
                </td>
                <td className="p-1.5 text-ink">
                  {labelOf(c.fieldKey)}
                  <div className="font-mono text-[11px] text-ink-secondary">{`{{${c.fieldKey}}}`}</div>
                </td>
                {HEALTH_NOTE_PLACES.map((p) => (
                  <td key={p} className="p-1.5 text-center">
                    <input type="checkbox" checked={c.places.includes(p)} onChange={() => toggle(i, p)} aria-label={t(`healthNotes.place.${p}`)} />
                  </td>
                ))}
                <td className="p-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={c.highlight}
                    onChange={(e) => edit(config.map((x, j) => (j === i ? { ...x, highlight: e.target.checked } : x)))}
                    aria-label={t("healthNotes.highlight")}
                  />
                </td>
                <td className="p-1.5">
                  <button type="button" onClick={() => edit(config.filter((_, j) => j !== i))} className="text-ink-secondary hover:text-red-600" aria-label={t("common.delete")}>
                    <X size={14} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
            {config.length === 0 && (
              <tr>
                <td colSpan={HEALTH_NOTE_PLACES.length + 4} className="p-2 text-ink-secondary">
                  {t("healthNotes.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value=""
          onChange={(e) => e.target.value && edit([...config, { fieldKey: e.target.value, places: ["detail", "meds", "incident", "pdf"], highlight: false }])}
          className="rounded-lg border border-mist bg-paper-2 px-2 py-1.5 text-[13px] text-ink"
        >
          <option value="">+ {t("healthNotes.addField")}</option>
          {available.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
        <button onClick={save} disabled={saving} className={btnPrimary}>
          {saving ? t("common.loading") : t("common.save")}
        </button>
        {status && <span className={"text-[13px] " + (status.ok ? "text-pine" : "text-red-600")}>{status.text}</span>}
      </div>
      <p className="mt-2 text-[11.5px] text-ink-secondary">{t("healthNotes.variableHint")}</p>
    </div>
  );
}
