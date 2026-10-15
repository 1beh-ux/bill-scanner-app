"use client";

import { useEffect, useState } from "react";
import PayerCombobox from "@/components/payers/PayerCombobox";
import type { Payer } from "@/lib/payers-client";

// Bill list -> selected bills -> "Změnit hodnotu": one field set on every selected bill through the
// same per-bill saves as the bill detail (PATCH /api/bills/[id], PUT .../categories), so locks
// (approved / AI running / closed event), payer checks, the CZK recalculation for a new date and the
// audit log all apply. Category = one category for the whole amount (replaces a split).
type Field = "payer" | "category" | "billDate" | "merchantName" | "notes";
type T = (key: string, vars?: Record<string, string>) => string;
export type BulkEditFailure = { billId: string; filename: string; error: string };

const FIELDS: Field[] = ["payer", "category", "billDate", "merchantName", "notes"];
const inputClass = "rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink";
const btnPrimary = "rounded-lg bg-ember px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

async function inBatches<A>(items: A[], size: number, fn: (a: A) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

export default function BillBulkEdit({
  eventId,
  bills,
  t,
  confirm,
  onDone,
}: {
  eventId: string;
  bills: { id: string; originalFilename: string; totalAmount: string | null }[];
  t: T;
  confirm: (o: { message: string }) => Promise<boolean>;
  onDone: (result: { succeeded: number; failed: BulkEditFailure[] }) => void;
}) {
  const [field, setField] = useState<Field>("payer");
  const [value, setValue] = useState("");
  const [payers, setPayers] = useState<Payer[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetch(`/api/events/${eventId}/payers`).then((r) => (r.ok ? r.json() : [])).then(setPayers).catch(() => {});
    fetch(`/api/events/${eventId}/categories`).then((r) => (r.ok ? r.json() : [])).then(setCategories).catch(() => {});
  }, [eventId]);

  const shownValue = () =>
    field === "payer" ? (payers.find((p) => p.id === value)?.canonicalName ?? t("billsPage.payerEventShort"))
      : field === "category" ? (categories.find((c) => c.id === value)?.name ?? "—")
      : field === "billDate" ? (value ? new Date(value).toLocaleDateString("cs-CZ") : "—")
      : value || "—";

  async function apply() {
    if (field === "category" && !value) return;
    if (!(await confirm({ message: t("billBulkEdit.confirm", { field: t(`billBulkEdit.field.${field}`), value: shownValue(), count: String(bills.length) }) }))) return;
    setRunning(true);
    let succeeded = 0;
    const failed: BulkEditFailure[] = [];
    await inBatches(bills, 4, async (b) => {
      const res =
        field === "category"
          ? await fetch(`/api/bills/${b.id}/categories`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ splits: [{ eventCategoryId: value, amount: b.totalAmount ?? "0" }] }) }).catch(() => null)
          : await fetch(`/api/bills/${b.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ [field === "payer" ? "payerAuthorId" : field]: value || null }),
            }).catch(() => null);
      if (res?.ok) succeeded++;
      else failed.push({ billId: b.id, filename: b.originalFilename, error: ((await res?.json().catch(() => ({}))) as { error?: string } | undefined)?.error ?? "unknown" });
    });
    setRunning(false);
    onDone({ succeeded, failed });
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-mist bg-paper-2 p-3">
      <select value={field} onChange={(e) => { setField(e.target.value as Field); setValue(""); }} className={inputClass} aria-label={t("billBulkEdit.fieldLabel")}>
        {FIELDS.map((f) => (
          <option key={f} value={f}>{t(`billBulkEdit.field.${f}`)}</option>
        ))}
      </select>
      <div className="min-w-[220px]">
        {field === "payer" && (
          <PayerCombobox eventId={eventId} payers={payers} value={value} onChange={setValue} onPayerCreated={(p) => setPayers((prev) => [...prev, p])} />
        )}
        {field === "category" && (
          <select value={value} onChange={(e) => setValue(e.target.value)} className={inputClass + " w-full"}>
            <option value="">{t("billBulkEdit.pickCategory")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        {field === "billDate" && <input type="date" value={value} onChange={(e) => setValue(e.target.value)} className={inputClass + " w-full"} />}
        {(field === "merchantName" || field === "notes") && (
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={t(field === "notes" ? "billBulkEdit.notesPlaceholder" : "billBulkEdit.merchantPlaceholder")} className={inputClass + " w-full"} />
        )}
      </div>
      <button type="button" onClick={apply} disabled={running || (field === "category" && !value)} className={btnPrimary}>
        {running ? t("common.loading") : t("billBulkEdit.apply", { count: String(bills.length) })}
      </button>
      <span className="basis-full text-[12px] text-ink-secondary">{t(field === "category" ? "billBulkEdit.categoryHint" : "billBulkEdit.hint")}</span>
    </div>
  );
}
