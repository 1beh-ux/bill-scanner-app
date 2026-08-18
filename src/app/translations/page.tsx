"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n";

type TranslationRow = { key: string; cs: string; en: string };

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";

function humanizeGroup(prefix: string) {
  if (prefix === "—") return prefix;
  const spaced = prefix.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export default function TranslationsPage() {
  const { t, role: currentUserRole, roleLoaded } = useTranslations();
  const router = useRouter();
  const [rows, setRows] = useState<TranslationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editCs, setEditCs] = useState("");
  const [editEn, setEditEn] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (roleLoaded && currentUserRole !== "admin") {
      router.replace("/events");
    }
  }, [roleLoaded, currentUserRole, router]);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/translations");
    if (res.ok) {
      setRows(await res.json());
    } else {
      setError(t("translationsPage.errorSaveFailed"));
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(row: TranslationRow) {
    setError(null);
    setEditingKey(row.key);
    setEditCs(row.cs);
    setEditEn(row.en);
  }

  function cancelEdit() {
    setEditingKey(null);
  }

  async function saveEdit(key: string) {
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/translations/${encodeURIComponent(key)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cs: editCs, en: editEn }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(t("translationsPage.errorSaveFailed"));
      return;
    }
    setEditingKey(null);
    load();
  }

  function toggleGroup(group: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? rows.filter(
          (r) =>
            r.key.toLowerCase().includes(query) ||
            r.cs.toLowerCase().includes(query) ||
            r.en.toLowerCase().includes(query)
        )
      : rows;

    const map = new Map<string, TranslationRow[]>();
    for (const row of filtered) {
      const dot = row.key.indexOf(".");
      const prefix = dot === -1 ? "—" : row.key.slice(0, dot);
      if (!map.has(prefix)) map.set(prefix, []);
      map.get(prefix)!.push(row);
    }
    return Array.from(map.entries());
  }, [rows, search]);

  if (!roleLoaded || currentUserRole !== "admin") return null;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <h1 className="mb-4 text-[22px] font-semibold text-ink">{t("nav.translations")}</h1>

      <div className="mb-4 max-w-sm">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("translationsPage.searchPlaceholder")}
          aria-label={t("translationsPage.searchPlaceholder")}
          className="w-full rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink placeholder:text-ink-secondary focus:outline-none focus:ring-1 focus:ring-ember"
        />
      </div>

      {error && <p className="mb-4 text-[14px] text-red-600">{error}</p>}

      {loading ? (
        <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
      ) : groups.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("translationsPage.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-mist text-left">
                <th className="p-2 text-[12px] font-medium text-ink-secondary">
                  {t("translationsPage.colKey")}
                </th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">CS</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">EN</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {groups.map(([group, groupRows]) => (
                <Fragment key={group}>
                  <tr className="border-b border-mist bg-paper-2">
                    <td colSpan={4} className="p-0">
                      <button
                        onClick={() => toggleGroup(group)}
                        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12px] font-medium text-ink-secondary hover:text-ink"
                      >
                        <span className="text-ink-secondary">{collapsed.has(group) ? "▸" : "▾"}</span>
                        {humanizeGroup(group)}
                        <span className="text-ink-secondary">({groupRows.length})</span>
                      </button>
                    </td>
                  </tr>
                  {!collapsed.has(group) &&
                    groupRows.map((row) =>
                      editingKey === row.key ? (
                        <tr key={row.key} className="border-b border-mist/60 bg-paper-2">
                          <td className="p-2 align-top font-mono text-[12px] text-ink-secondary">
                            {row.key}
                          </td>
                          <td className="p-2 align-top">
                            <textarea
                              rows={2}
                              value={editCs}
                              onChange={(e) => setEditCs(e.target.value)}
                              className={inputClass}
                              autoFocus
                            />
                          </td>
                          <td className="p-2 align-top">
                            <textarea
                              rows={2}
                              value={editEn}
                              onChange={(e) => setEditEn(e.target.value)}
                              className={inputClass}
                            />
                          </td>
                          <td className="whitespace-nowrap p-2 align-top">
                            <button
                              onClick={() => saveEdit(row.key)}
                              disabled={saving}
                              className="mr-3 text-[13px] text-pine hover:underline disabled:opacity-50"
                            >
                              {t("common.save")}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="text-[13px] text-ink-secondary hover:underline"
                            >
                              {t("common.cancel")}
                            </button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={row.key} className="border-b border-mist/60">
                          <td className="p-2 align-top font-mono text-[12px] text-ink-secondary">
                            {row.key}
                          </td>
                          <td className="p-2 align-top text-[13px] text-ink">{row.cs}</td>
                          <td className="p-2 align-top text-[13px] text-ink">{row.en}</td>
                          <td className="whitespace-nowrap p-2 align-top">
                            <button
                              onClick={() => startEdit(row)}
                              className="text-[13px] text-ember hover:underline"
                            >
                              {t("common.edit")}
                            </button>
                          </td>
                        </tr>
                      )
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
