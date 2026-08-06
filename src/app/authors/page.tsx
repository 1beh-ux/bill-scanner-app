"use client";

import { Fragment, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";

type Author = {
  id: string;
  canonicalName: string;
  bankAccountNumber: string | null;
  bankCode: string | null;
  active: boolean;
};

type EventItem = { id: string; name: string };

export default function AuthorsPage() {
  const { t } = useTranslations();
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
      const data = await res.json();
      setError(data.error || t("authors.errorAddFailed"));
      return;
    }

    setName("");
    setBankAccountNumber("");
    setBankCode("");
    load();
  }

  async function handleDelete(id: string, authorName: string) {
    if (!window.confirm(t("authors.confirmDelete", { name: authorName }))) return;
    const res = await fetch(`/api/authors/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || t("authors.errorDeleteFailed"));
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
      const data = await res.json();
      setError(data.error || t("authors.errorEditFailed"));
      return;
    }

    setEditingAuthorId(null);
    load();
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "2rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1rem" }}>{t("authors.title")}</h1>

      <form onSubmit={handleCreate} style={{ display: "flex", gap: "0.5rem", marginBottom: "2rem", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder={t("authors.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: "0.5rem", border: "1px solid #ccc", borderRadius: 4 }}
        />
        <input
          type="text"
          placeholder={t("authors.bankAccountPlaceholder")}
          value={bankAccountNumber}
          onChange={(e) => setBankAccountNumber(e.target.value)}
          style={{ padding: "0.5rem", border: "1px solid #ccc", borderRadius: 4 }}
        />
        <input
          type="text"
          placeholder={t("authors.bankCodePlaceholder")}
          value={bankCode}
          onChange={(e) => setBankCode(e.target.value)}
          style={{ padding: "0.5rem", border: "1px solid #ccc", borderRadius: 4, width: 100 }}
        />
        <button type="submit" style={{ padding: "0.5rem 1rem", background: "#111", color: "#fff", borderRadius: 4 }}>
          {t("authors.submit")}
        </button>
      </form>

      {error && <p style={{ color: "red", marginBottom: "1rem" }}>{error}</p>}

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : authors.length === 0 ? (
        <p>{t("authors.empty")}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th style={{ padding: "0.5rem" }}>{t("common.name")}</th>
              <th style={{ padding: "0.5rem" }}>{t("authors.colAccount")}</th>
              <th style={{ padding: "0.5rem" }}>{t("common.status")}</th>
              <th style={{ padding: "0.5rem" }}></th>
            </tr>
          </thead>
          <tbody>
            {authors.map((a) => (
              <Fragment key={a.id}>
                {editingAuthorId === a.id ? (
                  <tr style={{ borderBottom: "1px solid #eee", background: "#fafafa" }}>
                    <td style={{ padding: "0.5rem" }}>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder={t("authors.namePlaceholder")}
                        style={{ width: "100%", padding: "0.25rem", border: "1px solid #ccc", borderRadius: 4 }}
                        autoFocus
                      />
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <div style={{ display: "flex", gap: "0.25rem" }}>
                        <input
                          type="text"
                          value={editBankAccountNumber}
                          onChange={(e) => setEditBankAccountNumber(e.target.value)}
                          placeholder={t("authors.bankAccountPlaceholder")}
                          style={{ flex: 1, padding: "0.25rem", border: "1px solid #ccc", borderRadius: 4 }}
                        />
                        <input
                          type="text"
                          value={editBankCode}
                          onChange={(e) => setEditBankCode(e.target.value)}
                          placeholder={t("authors.bankCodePlaceholder")}
                          style={{ width: 70, padding: "0.25rem", border: "1px solid #ccc", borderRadius: 4 }}
                        />
                      </div>
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      {a.active ? t("common.statusActive") : t("authors.statusInactive")}
                    </td>
                    <td style={{ padding: "0.5rem", whiteSpace: "nowrap" }}>
                      <button
                        onClick={() => saveAuthorEdit(a.id)}
                        style={{ marginRight: "0.5rem", color: "#080", background: "none", border: "none", cursor: "pointer" }}
                      >
                        {t("common.save")}
                      </button>
                      <button
                        onClick={cancelEditAuthor}
                        style={{ color: "#666", background: "none", border: "none", cursor: "pointer" }}
                      >
                        {t("common.cancel")}
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "0.5rem" }}>{a.canonicalName}</td>
                    <td style={{ padding: "0.5rem" }}>
                      {a.bankAccountNumber
                        ? `${a.bankAccountNumber}${a.bankCode ? "/" + a.bankCode : ""}`
                        : "—"}
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <button
                        onClick={() => toggleActive(a)}
                        style={{
                          color: a.active ? "#080" : "#999",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          textDecoration: "underline",
                        }}
                      >
                        {a.active ? t("common.statusActive") : t("authors.statusInactive")}
                      </button>
                    </td>
                    <td style={{ padding: "0.5rem", whiteSpace: "nowrap" }}>
                      <button
                        onClick={() => startEditAuthor(a)}
                        style={{ marginRight: "0.5rem", color: "#0645AD", textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}
                      >
                        {t("common.edit")}
                      </button>
                      <button
                        onClick={() => toggleExpand(a.id)}
                        style={{ marginRight: "0.5rem", color: "#0645AD", textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}
                      >
                        {expandedId === a.id ? t("authors.eventAccessHide") : t("authors.eventAccessShow")}
                      </button>
                      <button
                        onClick={() => handleDelete(a.id, a.canonicalName)}
                        style={{ color: "#c00", background: "none", border: "none", cursor: "pointer" }}
                      >
                        {t("common.delete")}
                      </button>
                    </td>
                  </tr>
                )}
                {expandedId === a.id && (
                  <tr>
                    <td colSpan={4} style={{ padding: "0.75rem", background: "#fafafa" }}>
                      <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                        {t("authors.eventAccessShow")}
                      </div>
                      {allEvents.length === 0 ? (
                        <p style={{ fontSize: "0.85rem", color: "#666" }}>{t("authors.eventAccessEmpty")}</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                          {allEvents.map((ev) => {
                            const hasAccess = authorEvents.some((ae) => ae.id === ev.id);
                            return (
                              <label key={ev.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem" }}>
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
      )}
    </div>
  );
}
