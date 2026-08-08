"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "accountant";
  active: boolean;
};

export default function UsersPage() {
  const { t } = useTranslations();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"admin" | "accountant">("accountant");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<"admin" | "accountant">("accountant");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/users");
    if (res.ok) {
      setUsers(await res.json());
    } else {
      const data = await res.json().catch(() => ({}));
      setError(
        data.error === "forbidden" ? t("usersPage.error.forbidden") : t("usersPage.errorAddFailed")
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !displayName.trim()) return;

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), displayName: displayName.trim(), role }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        data.error === "duplicate_email"
          ? t("usersPage.error.duplicate_email")
          : t("usersPage.errorAddFailed")
      );
      return;
    }

    setEmail("");
    setDisplayName("");
    setRole("accountant");
    load();
  }

  function startEdit(u: UserRow) {
    setError(null);
    setEditingId(u.id);
    setEditName(u.displayName);
    setEditRole(u.role);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    setError(null);
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: editName.trim(), role: editRole }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        data.error === "cannot_demote_self"
          ? t("usersPage.error.cannot_demote_self")
          : t("usersPage.errorEditFailed")
      );
      return;
    }
    setEditingId(null);
    load();
  }

  async function toggleActive(u: UserRow) {
    setError(null);
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !u.active }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        data.error === "cannot_deactivate_self"
          ? t("usersPage.error.cannot_deactivate_self")
          : t("usersPage.errorEditFailed")
      );
      return;
    }
    load();
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "2rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1rem" }}>{t("usersPage.title")}</h1>

      <form onSubmit={handleCreate} style={{ display: "flex", gap: "0.5rem", marginBottom: "2rem", flexWrap: "wrap" }}>
        <input
          type="email"
          placeholder={t("usersPage.emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: "0.5rem", border: "1px solid #ccc", borderRadius: 4 }}
        />
        <input
          type="text"
          placeholder={t("usersPage.namePlaceholder")}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          style={{ padding: "0.5rem", border: "1px solid #ccc", borderRadius: 4 }}
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "admin" | "accountant")}
          style={{ padding: "0.5rem", border: "1px solid #ccc", borderRadius: 4 }}
        >
          <option value="accountant">{t("usersPage.roleAccountant")}</option>
          <option value="admin">{t("usersPage.roleAdmin")}</option>
        </select>
        <button type="submit" style={{ padding: "0.5rem 1rem", background: "#111", color: "#fff", borderRadius: 4 }}>
          {t("usersPage.submit")}
        </button>
      </form>

      {error && <p style={{ color: "red", marginBottom: "1rem" }}>{error}</p>}

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : users.length === 0 ? (
        <p>{t("usersPage.empty")}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th style={{ padding: "0.5rem" }}>{t("common.name")}</th>
              <th style={{ padding: "0.5rem" }}>{t("usersPage.colEmail")}</th>
              <th style={{ padding: "0.5rem" }}>{t("usersPage.colRole")}</th>
              <th style={{ padding: "0.5rem" }}>{t("common.status")}</th>
              <th style={{ padding: "0.5rem" }}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) =>
              editingId === u.id ? (
                <tr key={u.id} style={{ borderBottom: "1px solid #eee", background: "#fafafa" }}>
                  <td style={{ padding: "0.5rem" }}>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      style={{ width: "100%", padding: "0.25rem", border: "1px solid #ccc", borderRadius: 4 }}
                      autoFocus
                    />
                  </td>
                  <td style={{ padding: "0.5rem", color: "#666" }}>{u.email}</td>
                  <td style={{ padding: "0.5rem" }}>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value as "admin" | "accountant")}
                      style={{ padding: "0.25rem", border: "1px solid #ccc", borderRadius: 4 }}
                    >
                      <option value="accountant">{t("usersPage.roleAccountant")}</option>
                      <option value="admin">{t("usersPage.roleAdmin")}</option>
                    </select>
                  </td>
                  <td style={{ padding: "0.5rem" }}>
                    {u.active ? t("common.statusActive") : t("authors.statusInactive")}
                  </td>
                  <td style={{ padding: "0.5rem", whiteSpace: "nowrap" }}>
                    <button
                      onClick={() => saveEdit(u.id)}
                      style={{ marginRight: "0.5rem", color: "#080", background: "none", border: "none", cursor: "pointer" }}
                    >
                      {t("common.save")}
                    </button>
                    <button
                      onClick={cancelEdit}
                      style={{ color: "#666", background: "none", border: "none", cursor: "pointer" }}
                    >
                      {t("common.cancel")}
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={u.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "0.5rem" }}>{u.displayName}</td>
                  <td style={{ padding: "0.5rem", color: "#666" }}>{u.email}</td>
                  <td style={{ padding: "0.5rem" }}>
                    {u.role === "admin" ? t("usersPage.roleAdmin") : t("usersPage.roleAccountant")}
                  </td>
                  <td style={{ padding: "0.5rem" }}>
                    <button
                      onClick={() => toggleActive(u)}
                      style={{
                        color: u.active ? "#080" : "#999",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      {u.active ? t("common.statusActive") : t("authors.statusInactive")}
                    </button>
                  </td>
                  <td style={{ padding: "0.5rem", whiteSpace: "nowrap" }}>
                    <button
                      onClick={() => startEdit(u)}
                      style={{ color: "#0645AD", textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}
                    >
                      {t("common.edit")}
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
