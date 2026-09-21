"use client";

import { Fragment, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";

type Author = {
  id: string;
  canonicalName: string;
  bankAccountNumber: string | null;
  bankCode: string | null;
  active: boolean;
  mergedInto?: { canonicalName: string } | null;
  eventAccess?: { event: { id: string; name: string } }[];
};

type AuditRow = {
  id: string;
  at: string;
  byName: string;
  eventName: string | null;
  source: string;
  old: { account: string | null; code: string | null };
  new: { account: string | null; code: string | null };
};

function bankText(b: { account: string | null; code: string | null }): string {
  return b.account ? `${b.account}${b.code ? "/" + b.code : ""}` : "—";
}

type EventItem = { id: string; name: string };

const inputClass =
  "rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const inputClassSm =
  "rounded-lg border border-mist bg-paper-2 px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const linkBtn = "text-[13px] text-ember hover:underline";

export default function AuthorsPage() {
  const { t, role, roleLoaded } = useTranslations();
  const confirm = useConfirm();
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [history, setHistory] = useState<AuditRow[]>([]);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [allEvents, setAllEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [authorEvents, setAuthorEvents] = useState<EventItem[]>([]);

  const [editingAuthorId, setEditingAuthorId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBankAccountNumber, setEditBankAccountNumber] = useState("");
  const [editBankCode, setEditBankCode] = useState("");

  const [mergingAuthorId, setMergingAuthorId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeSaving, setMergeSaving] = useState(false);

  // API answers with stable codes (payers.error.*); older messages fall back to text.
  function errorText(code: unknown, fallbackKey: string): string {
    return typeof code === "string" && code.length > 0 && /^[a-z_]+$/.test(code) ? t(`payers.error.${code}`) : t(fallbackKey);
  }

  async function toggleHistory(authorId: string) {
    if (historyId === authorId) {
      setHistoryId(null);
      return;
    }
    setHistoryId(authorId);
    setHistory([]);
    const res = await fetch(`/api/authors/${authorId}/bank-audit`);
    if (res.ok) setHistory(await res.json());
  }

  async function load() {
    setLoading(true);
    const [authRes, evRes] = await Promise.all([
      fetch("/api/authors"),
      fetch("/api/events"),
    ]);
    if (authRes.ok) setAuthors(await authRes.json());
    if (evRes.ok) setAllEvents(await evRes.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;

    const res = await fetch("/api/authors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        canonicalName: name.trim(),
        bankAccountNumber: bankAccountNumber.trim() || null,
        bankCode: bankCode.trim() || null,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(errorText(data.error, "authors.errorAddFailed"));
      return;
    }

    setName("");
    setBankAccountNumber("");
    setBankCode("");
    load();
  }

  async function handleDelete(id: string, authorName: string) {
    if (!(await confirm({ message: t("authors.confirmDelete", { name: authorName }), danger: true }))) return;
    const res = await fetch(`/api/authors/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" && data.error.length > 0 ? data.error : t("authors.errorDeleteFailed"));
      return;
    }
    load();
  }

  async function toggleActive(author: Author) {
    await fetch(`/api/authors/${author.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !author.active }),
    });
    load();
  }

  async function toggleExpand(authorId: string) {
    if (expandedId === authorId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(authorId);
    const res = await fetch(`/api/authors/${authorId}/events`);
    if (res.ok) setAuthorEvents(await res.json());
  }

  async function grantAccess(authorId: string, eventId: string) {
    await fetch(`/api/authors/${authorId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId }),
    });
    const res = await fetch(`/api/authors/${authorId}/events`);
    if (res.ok) setAuthorEvents(await res.json());
  }

  async function revokeAccess(authorId: string, eventId: string) {
    await fetch(`/api/authors/${authorId}/events`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId }),
    });
    const res = await fetch(`/api/authors/${authorId}/events`);
    if (res.ok) setAuthorEvents(await res.json());
  }

  function startEditAuthor(a: Author) {
    setError(null);
    setExpandedId(null);
    setMergingAuthorId(null);
    setEditingAuthorId(a.id);
    setEditName(a.canonicalName);
    setEditBankAccountNumber(a.bankAccountNumber ?? "");
    setEditBankCode(a.bankCode ?? "");
  }

  function cancelEditAuthor() {
    setEditingAuthorId(null);
  }

  async function saveAuthorEdit(id: string) {
    setError(null);
    if (!editName.trim()) return;

    const res = await fetch(`/api/authors/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        canonicalName: editName.trim(),
        bankAccountNumber: editBankAccountNumber.trim() || null,
        bankCode: editBankCode.trim() || null,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(errorText(data.error, "authors.errorEditFailed"));
      return;
    }

    setEditingAuthorId(null);
    load();
  }

  function startMerge(a: Author) {
    setError(null);
    setEditingAuthorId(null);
    setExpandedId(null);
    setMergingAuthorId(a.id);
    setMergeTargetId("");
  }

  function cancelMerge() {
    setMergingAuthorId(null);
    setMergeTargetId("");
  }

  async function confirmMerge(source: Author) {
    if (!mergeTargetId) return;
    const target = authors.find((a) => a.id === mergeTargetId);
    if (!target) return;
    if (
      !(await confirm({
        message: t("authors.mergeConfirmDialog", { source: source.canonicalName, target: target.canonicalName }),
        danger: true,
        confirmLabel: t("authors.mergeConfirmButton"),
      }))
    )
      return;

    setMergeSaving(true);
    setError(null);
    const res = await fetch(`/api/authors/${source.id}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetAuthorId: mergeTargetId }),
    });
    setMergeSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const code = typeof data.error === "string" ? data.error : null;
      setError(code ? t(`authors.error.${code}`) : t("authors.errorMergeFailed"));
      return;
    }

    setMergingAuthorId(null);
    setMergeTargetId("");
    load();
  }

  if (roleLoaded && role !== "admin") {
    return <div className="p-8 text-[14px] text-ink-secondary">{t("common.adminOnly")}</div>;
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <h1 className="mb-1 text-[22px] font-semibold text-ink">{t("authors.title")}</h1>
      <p className="mb-4 text-[13px] text-ink-secondary">{t("authors.globalIntro")}</p>

      <form onSubmit={handleCreate} className="mb-8 flex flex-wrap gap-2">
        <input
          type="text"
          placeholder={t("authors.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
        <input
          type="text"
          placeholder={t("authors.bankAccountPlaceholder")}
          value={bankAccountNumber}
          onChange={(e) => setBankAccountNumber(e.target.value)}
          className={inputClass}
        />
        <input
          type="text"
          placeholder={t("authors.bankCodePlaceholder")}
          value={bankCode}
          onChange={(e) => setBankCode(e.target.value)}
          className={inputClass + " w-24"}
        />
        <button
          type="submit"
          className="rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover"
        >
          {t("authors.submit")}
        </button>
      </form>

      {error && <p className="mb-4 text-[14px] text-red-600">{error}</p>}

      {loading ? (
        <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
      ) : authors.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("authors.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="border-b border-mist text-left">
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("common.name")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("authors.colAccount")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("authors.colEvents")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("common.status")}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {authors.map((a) => (
                <Fragment key={a.id}>
                  {editingAuthorId === a.id ? (
                    <tr className="border-b border-mist/60 bg-paper-2">
                      <td className="p-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder={t("authors.namePlaceholder")}
                          className={inputClassSm + " w-full"}
                          autoFocus
                        />
                      </td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={editBankAccountNumber}
                            onChange={(e) => setEditBankAccountNumber(e.target.value)}
                            placeholder={t("authors.bankAccountPlaceholder")}
                            className={inputClassSm + " flex-1"}
                          />
                          <input
                            type="text"
                            value={editBankCode}
                            onChange={(e) => setEditBankCode(e.target.value)}
                            placeholder={t("authors.bankCodePlaceholder")}
                            className={inputClassSm + " w-16"}
                          />
                        </div>
                      </td>
                      <td className="p-2 text-[14px] text-ink-secondary">
                        {a.active ? t("common.statusActive") : t("authors.statusInactive")}
                      </td>
                      <td className="whitespace-nowrap p-2">
                        <button onClick={() => saveAuthorEdit(a.id)} className="mr-3 text-[13px] text-pine hover:underline">
                          {t("common.save")}
                        </button>
                        <button onClick={cancelEditAuthor} className="text-[13px] text-ink-secondary hover:underline">
                          {t("common.cancel")}
                        </button>
                      </td>
                    </tr>
                  ) : mergingAuthorId === a.id ? (
                    <tr className="border-b border-mist/60 bg-paper-2">
                      <td colSpan={5} className="p-2">
                        <div className="mb-1.5 text-[13px] text-ink">
                          {t("authors.mergeButton")}: <strong>{a.canonicalName}</strong>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={mergeTargetId}
                            onChange={(e) => setMergeTargetId(e.target.value)}
                            className={inputClassSm}
                          >
                            <option value="">{t("authors.mergeTargetPlaceholder")}</option>
                            {authors
                              .filter((other) => other.id !== a.id && other.active)
                              .map((other) => (
                                <option key={other.id} value={other.id}>
                                  {other.canonicalName}
                                </option>
                              ))}
                          </select>
                          <button
                            onClick={() => confirmMerge(a)}
                            disabled={!mergeTargetId || mergeSaving}
                            className="rounded-lg bg-red-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {t("authors.mergeConfirmButton")}
                          </button>
                          <button onClick={cancelMerge} className="text-[13px] text-ink-secondary hover:underline">
                            {t("common.cancel")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr className="border-b border-mist/60">
                      <td className="p-2 text-[14px] text-ink">
                        {a.canonicalName}
                        {!a.active && a.mergedInto && (
                          <div className="text-[12px] text-ink-secondary">
                            {t("authors.mergedBadge", { name: a.mergedInto.canonicalName })}
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-[14px] text-ink-secondary">
                        {a.bankAccountNumber
                          ? `${a.bankAccountNumber}${a.bankCode ? "/" + a.bankCode : ""}`
                          : "—"}
                      </td>
                      <td className="p-2 text-[13px] text-ink-secondary">
                        {a.eventAccess && a.eventAccess.length > 0 ? a.eventAccess.map((ea) => ea.event.name).join(", ") : "—"}
                      </td>
                      <td className="p-2">
                        <button
                          onClick={() => toggleActive(a)}
                          className={
                            "whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] " +
                            (a.active ? "bg-pine-bg text-pine" : "bg-mist text-ink-secondary")
                          }
                        >
                          {a.active ? t("common.statusActive") : t("authors.statusInactive")}
                        </button>
                      </td>
                      <td className="whitespace-nowrap p-2">
                        <button onClick={() => startEditAuthor(a)} className={linkBtn + " mr-3"}>
                          {t("common.edit")}
                        </button>
                        {a.active && (
                          <button onClick={() => startMerge(a)} className={linkBtn + " mr-3"}>
                            {t("authors.mergeButton")}
                          </button>
                        )}
                        <button onClick={() => toggleExpand(a.id)} className={linkBtn + " mr-3"}>
                          {expandedId === a.id ? t("authors.eventAccessHide") : t("authors.eventAccessShow")}
                        </button>
                        <button onClick={() => toggleHistory(a.id)} className={linkBtn + " mr-3"}>
                          {t("authors.bankHistory")}
                        </button>
                        <button
                          onClick={() => handleDelete(a.id, a.canonicalName)}
                          className="text-[13px] text-red-600 hover:underline"
                        >
                          {t("common.delete")}
                        </button>
                      </td>
                    </tr>
                  )}
                  {historyId === a.id && (
                    <tr>
                      <td colSpan={5} className="bg-paper-2 p-3">
                        <div className="mb-2 text-[13px] font-medium text-ink">{t("authors.bankHistory")}</div>
                        {history.length === 0 ? (
                          <p className="text-[13px] text-ink-secondary">{t("authors.bankHistoryEmpty")}</p>
                        ) : (
                          <ul className="flex flex-col gap-1 text-[13px] text-ink-secondary">
                            {history.map((h) => (
                              <li key={h.id}>
                                {new Date(h.at).toLocaleString("cs-CZ")} — {h.byName}: {bankText(h.old)} → {bankText(h.new)}{" "}
                                <span className="text-[12px]">
                                  ({t(`authors.auditSource.${h.source}`)}
                                  {h.eventName ? `, ${h.eventName}` : ""})
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                  {expandedId === a.id && (
                    <tr>
                      <td colSpan={5} className="bg-paper-2 p-3">
                        <div className="mb-2 text-[13px] font-medium text-ink">{t("authors.eventAccessShow")}</div>
                        {allEvents.length === 0 ? (
                          <p className="text-[13px] text-ink-secondary">{t("authors.eventAccessEmpty")}</p>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {allEvents.map((ev) => {
                              const hasAccess = authorEvents.some((ae) => ae.id === ev.id);
                              return (
                                <label key={ev.id} className="flex items-center gap-2 text-[14px] text-ink">
                                  <input
                                    type="checkbox"
                                    checked={hasAccess}
                                    onChange={() =>
                                      hasAccess ? revokeAccess(a.id, ev.id) : grantAccess(a.id, ev.id)
                                    }
                                  />
                                  {ev.name}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
