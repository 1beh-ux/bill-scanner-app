"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import AddPayerPanel from "@/components/payers/AddPayerPanel";
import {
  attachPayer,
  updatePayer,
  removePayer,
  isRecentBankChange,
  type Payer,
} from "@/lib/payers-client";

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

// The event's payers (Plátci): anyone with bills access to the event can see
// them, add a new one or attach an existing one, edit bank details and remove
// a payer from the event (existing bills keep their payer).
export default function EventPayersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const { t } = useTranslations();
  const confirm = useConfirm();

  const [eventName, setEventName] = useState("");
  const [payers, setPayers] = useState<Payer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState<"none" | "new" | "existing">("none");
  const [searchQ, setSearchQ] = useState("");
  const [found, setFound] = useState<{ id: string; canonicalName: string }[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAccount, setEditAccount] = useState("");
  const [editCode, setEditCode] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [evRes, payRes] = await Promise.all([fetch(`/api/events/${eventId}`), fetch(`/api/events/${eventId}/payers`)]);
    if (evRes.ok) setEventName((await evRes.json()).name);
    if (payRes.ok) setPayers(await payRes.json());
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  // Search the global pool (names only) for payers not yet attached.
  useEffect(() => {
    if (adding !== "existing" || searchQ.trim().length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/events/${eventId}/payers/search?q=${encodeURIComponent(searchQ.trim())}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((rows) => !cancelled && setFound(rows));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [adding, searchQ, eventId]);

  async function attach(authorId: string) {
    setError(null);
    const res = await attachPayer(eventId, authorId);
    if (!res.ok) return setError(res.error);
    setAdding("none");
    setSearchQ("");
    setFound([]);
    load();
  }

  function startEdit(p: Payer) {
    setEditingId(p.id);
    setEditName(p.canonicalName);
    setEditAccount(p.bankAccountNumber ?? "");
    setEditCode(p.bankCode ?? "");
    setError(null);
  }

  async function saveEdit(p: Payer) {
    setSaving(true);
    setError(null);
    const res = await updatePayer(eventId, p.id, { canonicalName: editName, bankAccountNumber: editAccount, bankCode: editCode });
    setSaving(false);
    if (!res.ok) return setError(res.error);
    setEditingId(null);
    load();
  }

  async function remove(p: Payer) {
    const count = p.billCount ?? 0;
    const ok = await confirm({
      message:
        count > 0
          ? t("payers.confirmRemoveWithBills", { name: p.canonicalName, count: String(count) })
          : t("payers.confirmRemove", { name: p.canonicalName }),
      confirmLabel: t("payers.remove"),
      danger: true,
    });
    if (!ok) return;
    setError(null);
    const res = await removePayer(eventId, p.id, count > 0);
    if (!res.ok) return setError(res.error);
    load();
  }

  if (loading) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[22px] font-semibold text-ink">
          {eventName} — {t("payers.title")} ({payers.length})
        </h1>
        <div className="flex gap-2">
          <button onClick={() => setAdding(adding === "existing" ? "none" : "existing")} className="rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2">
            {t("payers.attachExisting")}
          </button>
          <button onClick={() => setAdding(adding === "new" ? "none" : "new")} className={btnPrimary}>
            {t("payers.addNew")}
          </button>
        </div>
      </div>
      <p className="mb-4 text-[13px] text-ink-secondary">{t("payers.intro")}</p>

      {error && <p className="mb-3 text-[13px] text-red-600">{t(`payers.error.${error}`)}</p>}

      {adding === "new" && (
        <div className="mb-4">
          <AddPayerPanel
            eventId={eventId}
            onCancel={() => setAdding("none")}
            onDone={() => {
              setAdding("none");
              load();
            }}
          />
        </div>
      )}

      {adding === "existing" && (
        <div className="mb-4 rounded-lg border border-mist bg-paper p-3">
          <input
            type="text"
            autoFocus
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder={t("payers.searchPlaceholder")}
            className={inputClass}
          />
          <p className="mt-1 text-[12px] text-ink-secondary">{t("payers.searchHint")}</p>
          {searchQ.trim().length >= 2 && (
            <ul className="mt-2 flex flex-col">
              {found.length === 0 && <li className="py-1 text-[13px] text-ink-secondary">{t("payers.searchNone")}</li>}
              {found.map((f) => (
                <li key={f.id} className="flex items-center justify-between border-b border-mist/60 py-1.5 text-[14px] text-ink">
                  {f.canonicalName}
                  <button onClick={() => attach(f.id)} className="text-[13px] text-ember hover:underline">
                    {t("payers.attach")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {payers.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("payers.none")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-mist text-left">
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("payers.colName")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("payers.colAccount")}</th>
                <th className="p-2 text-right text-[12px] font-medium text-ink-secondary">{t("payers.colBills")}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {payers.map((p) =>
                editingId === p.id ? (
                  <tr key={p.id} className="border-b border-mist/60 bg-paper-2/50">
                    <td className="p-2">
                      <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className={inputClass} />
                    </td>
                    <td className="p-2">
                      <div className="grid grid-cols-[1fr_90px] gap-2">
                        <input type="text" value={editAccount} onChange={(e) => setEditAccount(e.target.value)} placeholder={t("payers.accountLabel")} className={inputClass} />
                        <input type="text" value={editCode} onChange={(e) => setEditCode(e.target.value)} placeholder={t("payers.bankCodeLabel")} className={inputClass} />
                      </div>
                    </td>
                    <td className="p-2 text-right text-[14px] text-ink-secondary">{p.billCount}</td>
                    <td className="whitespace-nowrap p-2 text-right">
                      <button onClick={() => setEditingId(null)} className="mr-3 text-[13px] text-ink-secondary hover:underline">
                        {t("common.cancel")}
                      </button>
                      <button onClick={() => saveEdit(p)} disabled={saving} className={btnPrimary + " !px-3 !py-1.5 !text-[13px]"}>
                        {saving ? t("common.loading") : t("common.save")}
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id} className="border-b border-mist/60">
                    <td className="p-2 text-[14px] text-ink">{p.canonicalName}</td>
                    <td className="p-2 text-[14px] text-ink">
                      {p.bankAccountNumber && p.bankCode ? (
                        `${p.bankAccountNumber}/${p.bankCode}`
                      ) : (
                        <span className="text-amber-700">{t("payers.noBank")}</span>
                      )}
                      {isRecentBankChange(p.lastBankChange) && p.lastBankChange && (
                        <div className="text-[12px] text-amber-700">
                          {t("payers.bankChanged", {
                            date: new Date(p.lastBankChange.at).toLocaleDateString("cs-CZ"),
                            name: p.lastBankChange.byName,
                          })}
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-right text-[14px] text-ink-secondary">{p.billCount}</td>
                    <td className="whitespace-nowrap p-2 text-right">
                      <button onClick={() => startEdit(p)} className="mr-3 text-[13px] text-ember hover:underline">
                        {t("common.edit")}
                      </button>
                      <button onClick={() => remove(p)} className="text-[13px] text-red-600 hover:underline">
                        {t("payers.remove")}
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
