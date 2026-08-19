"use client";

import { useTranslations } from "@/lib/i18n";
import type { MailMessage } from "./types";

const inputClass =
  "w-20 rounded-lg border border-mist bg-paper-2 px-2 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const selectClass =
  "rounded-lg border border-mist bg-paper-2 px-2 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnSecondary =
  "rounded-lg border border-mist bg-paper-2 px-2.5 py-1.5 text-[12px] text-ink hover:bg-mist disabled:opacity-50";
const btnDanger = "rounded-lg bg-red-600 px-2.5 py-1.5 text-[12px] text-white hover:bg-red-700 disabled:opacity-50";

function fmtDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("cs-CZ");
  } catch {
    return iso;
  }
}

export default function MailInboxList({
  messages,
  loading,
  count,
  onCountChange,
  onLoad,
  sort,
  onSortChange,
  selectedMessageId,
  onSelectMessage,
  selectMode,
  onToggleSelectMode,
  selectedIds,
  onToggleSelectedId,
  onSelectAll,
  onClearSelection,
  onBulkMove,
  onBulkDelete,
  bulkBusy,
}: {
  messages: MailMessage[];
  loading: boolean;
  count: number;
  onCountChange: (n: number) => void;
  onLoad: () => void;
  sort: "oldest" | "newest";
  onSortChange: (s: "oldest" | "newest") => void;
  selectedMessageId: string | null;
  onSelectMessage: (id: string) => void;
  selectMode: boolean;
  onToggleSelectMode: () => void;
  selectedIds: Record<string, boolean>;
  onToggleSelectedId: (id: string, checked: boolean) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkMove: () => void;
  onBulkDelete: () => void;
  bulkBusy: boolean;
}) {
  const { t } = useTranslations();
  const selectedCount = Object.values(selectedIds).filter(Boolean).length;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={5}
          max={100}
          value={count}
          onChange={(e) => onCountChange(Number(e.target.value) || 25)}
          className={inputClass}
        />
        <button onClick={onLoad} disabled={loading} className={btnSecondary}>
          {loading ? t("common.loading") : t("mailInbox.loadButton")}
        </button>
        <select value={sort} onChange={(e) => onSortChange(e.target.value as "oldest" | "newest")} className={selectClass}>
          <option value="oldest">{t("mailInbox.sortOldest")}</option>
          <option value="newest">{t("mailInbox.sortNewest")}</option>
        </select>
        <button onClick={onToggleSelectMode} className={btnSecondary}>
          {selectMode ? t("mailInbox.closeSelectButton") : t("mailInbox.selectButton")}
        </button>
      </div>

      {selectMode && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button onClick={onSelectAll} className={btnSecondary}>
            {t("mailInbox.selectAllButton")}
          </button>
          <button onClick={onClearSelection} className={btnSecondary}>
            {t("mailInbox.clearSelectionButton")}
          </button>
          <button onClick={onBulkMove} disabled={selectedCount === 0 || bulkBusy} className={btnSecondary}>
            {t("mailInbox.bulkMoveButton")}
          </button>
          <button onClick={onBulkDelete} disabled={selectedCount === 0 || bulkBusy} className={btnDanger}>
            {t("mailInbox.bulkDeleteButton")}
          </button>
          {selectedCount > 0 && (
            <span className="text-[12px] text-ink-secondary">{t("mailInbox.selectedCount", { count: String(selectedCount) })}</span>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-mist">
        {messages.length === 0 ? (
          <p className="p-4 text-[13px] text-ink-secondary">
            {loading ? t("common.loading") : t("mailInbox.empty")}
          </p>
        ) : (
          <ul className="list-none divide-y divide-mist p-0">
            {messages.map((m) => (
              <li
                key={m.messageId}
                className={
                  "cursor-pointer px-3 py-2 " +
                  (m.messageId === selectedMessageId ? "bg-ember/10" : "hover:bg-paper-2")
                }
                onClick={() => !selectMode && onSelectMessage(m.messageId)}
              >
                <div className="flex items-start gap-2">
                  {selectMode && (
                    <input
                      type="checkbox"
                      checked={Boolean(selectedIds[m.messageId])}
                      onChange={(e) => onToggleSelectedId(m.messageId, e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 h-4 w-4 shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink">{m.subject || t("mailInbox.noSubject")}</p>
                    <p className="truncate text-[12px] text-ink-secondary">
                      {m.from} · {fmtDate(m.date)}
                    </p>
                    <p className="truncate text-[12px] text-ink-secondary">{m.snippet}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
