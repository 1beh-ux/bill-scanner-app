"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";

type Role = "admin" | "accountant" | "user";

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  active: boolean;
};

const ROLE_LABEL_KEYS: Record<Role, string> = {
  admin: "usersPage.roleAdmin",
  accountant: "usersPage.roleAccountant",
  user: "usersPage.roleUser",
};

const inputClass =
  "rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const inputClassSm =
  "rounded-lg border border-mist bg-paper-2 px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";

export default function UsersPage() {
  const { t } = useTranslations();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("user");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<Role>("user");

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
    setRole("user");
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
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <h1 className="mb-4 text-[22px] font-semibold text-ink">{t("usersPage.title")}</h1>

      <form onSubmit={handleCreate} className="mb-8 flex flex-wrap gap-2">
        <input
          type="email"
          placeholder={t("usersPage.emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
        <input
          type="text"
          placeholder={t("usersPage.namePlaceholder")}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className={inputClass}
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className={inputClass}
        >
          <option value="user">{t("usersPage.roleUser")}</option>
          <option value="accountant">{t("usersPage.roleAccountant")}</option>
          <option value="admin">{t("usersPage.roleAdmin")}</option>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover"
        >
          {t("usersPage.submit")}
        </button>
      </form>

      {error && <p className="mb-4 text-[14px] text-red-600">{error}</p>}

      {loading ? (
        <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
      ) : users.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("usersPage.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="border-b border-mist text-left">
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("common.name")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("usersPage.colEmail")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("usersPage.colRole")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("common.status")}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) =>
                editingId === u.id ? (
                  <tr key={u.id} className="border-b border-mist/60 bg-paper-2">
                    <td className="p-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className={inputClassSm + " w-full"}
                        autoFocus
                      />
                    </td>
                    <td className="p-2 text-[14px] text-ink-secondary">{u.email}</td>
                    <td className="p-2">
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value as Role)}
                        className={inputClassSm}
                      >
                        <option value="user">{t("usersPage.roleUser")}</option>
                        <option value="accountant">{t("usersPage.roleAccountant")}</option>
                        <option value="admin">{t("usersPage.roleAdmin")}</option>
                      </select>
                    </td>
                    <td className="p-2 text-[14px] text-ink-secondary">
                      {u.active ? t("common.statusActive") : t("authors.statusInactive")}
                    </td>
                    <td className="whitespace-nowrap p-2">
                      <button onClick={() => saveEdit(u.id)} className="mr-3 text-[13px] text-pine hover:underline">
                        {t("common.save")}
                      </button>
                      <button onClick={cancelEdit} className="text-[13px] text-ink-secondary hover:underline">
                        {t("common.cancel")}
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={u.id} className="border-b border-mist/60">
                    <td className="p-2 text-[14px] text-ink">{u.displayName}</td>
                    <td className="p-2 text-[14px] text-ink-secondary">{u.email}</td>
                    <td className="p-2 text-[14px] text-ink">
                      {t(ROLE_LABEL_KEYS[u.role])}
                    </td>
                    <td className="p-2">
                      <button
                        onClick={() => toggleActive(u)}
                        className={
                          "whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] " +
                          (u.active ? "bg-pine-bg text-pine" : "bg-mist text-ink-secondary")
                        }
                      >
                        {u.active ? t("common.statusActive") : t("authors.statusInactive")}
                      </button>
                    </td>
                    <td className="whitespace-nowrap p-2">
                      <button onClick={() => startEdit(u)} className="text-[13px] text-ember hover:underline">
                        {t("common.edit")}
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
