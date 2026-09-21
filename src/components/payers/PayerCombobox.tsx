"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import AddPayerPanel from "@/components/payers/AddPayerPanel";
import type { Payer } from "@/lib/payers-client";

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember disabled:bg-paper disabled:text-ink-secondary";

function fold(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Payer picker for the bill form: type to filter the event's payers (diacritics
// ignored), pick one, or "+ Nový plátce" to create and attach one inline.
// value "" = paid directly by the event (no payer). `currentPayer` keeps a
// bill's payer visible even if it was since removed from the event's list.
export default function PayerCombobox({
  eventId,
  payers,
  value,
  currentPayer,
  disabled,
  onChange,
  onPayerCreated,
}: {
  eventId: string;
  payers: Payer[];
  value: string;
  currentPayer?: { id: string; canonicalName: string } | null;
  disabled?: boolean;
  onChange: (id: string) => void;
  onPayerCreated: (p: Payer) => void;
}) {
  const { t } = useTranslations();
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const all = useMemo(() => {
    const list = payers.map((p) => ({ id: p.id, name: p.canonicalName }));
    if (currentPayer && !list.some((p) => p.id === currentPayer.id)) list.push({ id: currentPayer.id, name: currentPayer.canonicalName });
    return list;
  }, [payers, currentPayer]);

  const selectedName = value ? all.find((p) => p.id === value)?.name ?? "" : t("billModal.payerEvent");
  const matches = all.filter((p) => fold(p.name).includes(fold(query)));

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  if (creating) {
    return (
      <AddPayerPanel
        eventId={eventId}
        initialName={query}
        onCancel={() => setCreating(false)}
        onDone={(p) => {
          onPayerCreated(p);
          onChange(p.id);
          setCreating(false);
          setQuery("");
        }}
      />
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        disabled={disabled}
        value={open ? query : selectedName}
        placeholder={selectedName}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className={inputClass}
      />
      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-mist bg-paper py-1 shadow-lg"
        >
          {!query.trim() && (
            <li role="option" aria-selected={value === ""}>
              <button type="button" onClick={() => pick("")} className="w-full px-3 py-1.5 text-left text-[14px] text-ink-secondary hover:bg-paper-2">
                {t("billModal.payerEvent")}
              </button>
            </li>
          )}
          {matches.map((p) => (
            <li key={p.id} role="option" aria-selected={value === p.id}>
              <button type="button" onClick={() => pick(p.id)} className="w-full px-3 py-1.5 text-left text-[14px] text-ink hover:bg-paper-2">
                {p.name}
              </button>
            </li>
          ))}
          <li role="option" aria-selected={false}>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="w-full border-t border-mist px-3 py-1.5 text-left text-[14px] text-ember hover:bg-paper-2"
            >
              {query.trim() ? t("payers.newPayerNamed", { name: query.trim() }) : t("payers.newPayerOption")}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
