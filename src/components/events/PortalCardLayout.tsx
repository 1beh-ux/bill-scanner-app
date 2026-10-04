"use client";

import { useEffect, useState } from "react";
import { AddFieldSelect, DropZone, FieldRow, SectionCard, type LayoutDrag } from "@/components/participants/LayoutEditor";
import { moveSection, resolvePortalLayout, type PageLayout, type Section } from "@/lib/participant-layout";

// Event settings -> what a registration card in the parent portal shows
// (docs/registration-slice3-spec.md F), with the same layout editor pieces as
// the participant detail ("Upravit rozvržení"): blocks in order, hide/show,
// own read-only field sections. Stored as Event.participantLayout.portal;
// none saved = the default card.
type FieldDef = { key: string; label: string };

const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

export default function PortalCardLayout({ eventId, t }: { eventId: string; t: (key: string, vars?: Record<string, string>) => string }) {
  const [layout, setLayout] = useState<PageLayout | null>(null);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [drag, setDrag] = useState<LayoutDrag>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/events/${eventId}/participant-layout`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { layout: { portal?: PageLayout } | null; fields: FieldDef[] } | null) => {
        if (!d) return;
        setFields(d.fields);
        setLayout(resolvePortalLayout(d.layout?.portal ?? null, new Set(d.fields.map((f) => f.key))));
      })
      .catch(() => {});
  }, [eventId]);

  if (!layout) return null;
  const update = (id: string, patch: Partial<Section>) => setLayout((l) => l && { ...l, sections: l.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const label = (key: string) => fields.find((f) => f.key === key)?.label ?? key;

  async function save() {
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/events/${eventId}/participant-layout`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: "portal", layout }) });
    setSaving(false);
    setMessage(res.ok ? t("portalSettings.saved") : t("registrationSettings.saveFailed"));
  }

  function dropOn(beforeId: string | null) {
    if (drag?.type === "section") setLayout((l) => l && moveSection(l, drag.id, beforeId, "left"));
    setDrag(null);
  }

  return (
    <div className="mt-6 flex max-w-md flex-col gap-2 border-t border-mist pt-4">
      <h4 className="text-[14px] font-semibold text-ink">{t("portalCard.title")}</h4>
      <p className="text-[11.5px] text-ink-secondary">{t("portalCard.hint")}</p>
      {layout.sections.map((s) => (
        <SectionCard
          key={s.id}
          title={s.kind === "fields" ? (s.title ?? "") : t(`portalCard.kind.${s.kind}`)}
          onTitleChange={s.kind === "fields" ? (v) => update(s.id, { title: v }) : undefined}
          titlePlaceholder={t("portalCard.kind.fields")}
          hidden={s.hidden}
          onToggleHidden={s.kind === "fields" ? undefined : () => update(s.id, { hidden: !s.hidden || undefined })}
          onRemove={s.kind === "fields" ? () => setLayout((l) => l && { ...l, sections: l.sections.filter((x) => x.id !== s.id) }) : undefined}
          onDragStart={() => setDrag({ type: "section", id: s.id })}
          onDrop={() => dropOn(s.id)}
          dragging={drag?.type === "section" && drag.id === s.id}
        >
          {s.kind === "fields" && (
            <>
              {(s.fields ?? []).map((k) => (
                <FieldRow
                  key={k}
                  label={label(k)}
                  onHide={() => update(s.id, { fields: (s.fields ?? []).filter((x) => x !== k) })}
                  onDragStart={() => setDrag({ type: "field", key: k })}
                  onDrop={() => {
                    if (drag?.type === "field" && drag.key !== k) {
                      const rest = (s.fields ?? []).filter((x) => x !== drag.key);
                      rest.splice(rest.indexOf(k), 0, drag.key);
                      update(s.id, { fields: rest });
                    }
                    setDrag(null);
                  }}
                  dragging={drag?.type === "field" && drag.key === k}
                />
              ))}
              <AddFieldSelect options={fields.filter((f) => !(s.fields ?? []).includes(f.key))} onAdd={(k) => update(s.id, { fields: [...(s.fields ?? []), k] })} />
            </>
          )}
        </SectionCard>
      ))}
      <DropZone onDrop={() => dropOn(null)}>
        <button
          type="button"
          onClick={() => setLayout((l) => l && { ...l, sections: [...l.sections, { id: `fields-${Date.now()}`, kind: "fields", column: "left", fields: [] }] })}
          className="text-[13px] text-ember hover:underline"
        >
          + {t("layoutEditor.newSection")}
        </button>
      </DropZone>
      {message && <p className="text-[13px] text-ink">{message}</p>}
      <div className="flex justify-end">
        <button type="button" onClick={save} disabled={saving} className={btnPrimary}>
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}
