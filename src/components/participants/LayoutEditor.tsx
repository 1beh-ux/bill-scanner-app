"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, GripVertical, Trash2, X } from "lucide-react";
import { useTranslations } from "@/lib/i18n";

// Building blocks of the in-place "Upravit rozvržení" editor (participant
// detail, Zdraví detail). Plain HTML5 drag & drop; the pages own the layout
// state and say what a drop means (see moveSection/moveField in participant-layout.ts).

const iconBtn = "rounded p-1 text-ink-secondary hover:bg-paper-2 hover:text-ink";
export const sectionTitleClass = "text-[13px] font-semibold uppercase tracking-wide text-ink-secondary";

/** What is being dragged right now (pages keep it in state). */
export type LayoutDrag = { type: "section"; id: string } | { type: "field"; key: string } | null;

export function SectionCard({
  title,
  onTitleChange,
  titlePlaceholder,
  hidden,
  onToggleHidden,
  onMove,
  onRemove,
  onDragStart,
  onDrop,
  dragging,
  children,
}: {
  title: string;
  onTitleChange?: (v: string) => void;
  titlePlaceholder?: string;
  hidden?: boolean;
  onToggleHidden?: () => void;
  onMove?: { dir: "left" | "right"; run: () => void };
  onRemove?: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  dragging?: boolean;
  children?: React.ReactNode;
}) {
  const { t } = useTranslations();
  // Draggable only from the handle, so the title input stays selectable.
  const [armed, setArmed] = useState(false);
  return (
    <section
      draggable={armed}
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={() => setArmed(false)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop();
      }}
      className={"flex flex-col gap-2 rounded-lg border-2 border-dashed border-mist bg-paper p-3 " + (hidden ? "opacity-50 " : "") + (dragging ? "opacity-30" : "")}
    >
      <div className="flex items-center gap-2">
        <span onMouseDown={() => setArmed(true)} onMouseUp={() => setArmed(false)} className="cursor-grab text-ink-secondary" title={t("healthNotes.dragHint")}>
          <GripVertical size={16} aria-hidden="true" />
        </span>
        {onTitleChange ? (
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder={titlePlaceholder}
            className="min-w-0 flex-1 rounded border border-mist bg-paper-2 px-2 py-0.5 text-[13px] font-semibold uppercase tracking-wide text-ink focus:outline-none focus:ring-1 focus:ring-ember"
          />
        ) : (
          <h2 className={sectionTitleClass + " flex-1"}>{title}</h2>
        )}
        {onMove && (
          <button type="button" onClick={onMove.run} className={iconBtn} title={t(onMove.dir === "left" ? "layoutEditor.moveLeft" : "layoutEditor.moveRight")}>
            {onMove.dir === "left" ? <ArrowLeft size={15} aria-hidden="true" /> : <ArrowRight size={15} aria-hidden="true" />}
          </button>
        )}
        {onToggleHidden && (
          <button type="button" onClick={onToggleHidden} className={iconBtn} title={t(hidden ? "layoutEditor.show" : "layoutEditor.hide")}>
            {hidden ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
          </button>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} className={iconBtn} title={t("layoutEditor.removeSection")}>
            <X size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

export function FieldRow({
  label,
  onHide,
  onDelete,
  onDragStart,
  onDrop,
  dragging,
}: {
  label: string;
  onHide: () => void;
  onDelete?: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  dragging?: boolean;
}) {
  const { t } = useTranslations();
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop();
      }}
      className={"flex cursor-grab items-center gap-2 rounded-lg border border-mist bg-paper-2 px-2 py-1.5 text-[14px] text-ink " + (dragging ? "opacity-30" : "")}
    >
      <GripVertical size={14} className="shrink-0 text-ink-secondary" aria-hidden="true" />
      <span className="flex-1">{label}</span>
      <button type="button" onClick={onHide} className={iconBtn} title={t("layoutEditor.hide")}>
        <EyeOff size={14} aria-hidden="true" />
      </button>
      {onDelete && (
        <button type="button" onClick={onDelete} className={iconBtn + " hover:text-red-600"} title={t("layoutEditor.deleteField")}>
          <Trash2 size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** "+ přidat pole": hidden / not shown fields to put into this section. */
export function AddFieldSelect({ options, onAdd }: { options: { key: string; label: string }[]; onAdd: (key: string) => void }) {
  const { t } = useTranslations();
  if (!options.length) return null;
  return (
    <select value="" onChange={(e) => e.target.value && onAdd(e.target.value)} className="self-start rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[13px] text-ink">
      <option value="">+ {t("layoutEditor.addField")}</option>
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** End of a column: drop a section here to put it last; holds "+ nová sekce". */
export function DropZone({ onDrop, children }: { onDrop: () => void; children?: React.ReactNode }) {
  const { t } = useTranslations();
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className="flex min-h-10 flex-wrap items-center justify-center gap-3 rounded-lg border border-dashed border-mist p-2 text-[12px] text-ink-secondary"
    >
      {t("layoutEditor.dropHere")}
      {children}
    </div>
  );
}

/** Content shown for reference in edit mode, not usable. */
export const Inert = ({ children }: { children: React.ReactNode }) => (
  <div inert className="pointer-events-none select-none opacity-60">
    {children}
  </div>
);

/** Sticky bar while editing: hint, Zrušit, Uložit rozvržení. */
export function LayoutEditorBar({ saving, error, onCancel, onSave }: { saving: boolean; error: string | null; onCancel: () => void; onSave: () => void }) {
  const { t } = useTranslations();
  return (
    <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-mist bg-paper px-4 py-3 md:mx-0 md:px-0">
      <span className="text-[12px] text-ink-secondary">{t("layoutEditor.hint")}</span>
      <div className="flex items-center gap-2">
        {error && <span className="text-[13px] text-red-600">{error}</span>}
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2 disabled:opacity-50">
          {t("layoutEditor.cancel")}
        </button>
        <button type="button" onClick={onSave} disabled={saving} className="rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50">
          {saving ? t("common.loading") : t("layoutEditor.save")}
        </button>
      </div>
    </div>
  );
}
