"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import ListTemplateAdmin from "@/components/health/ListTemplateAdmin";
import EmailTemplateAdmin from "@/components/health/EmailTemplateAdmin";

type CategoryTemplateRow = { id: string; name: string; description: string | null };

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

export default function TemplatesPage() {
  const { t } = useTranslations();
  const [tab, setTab] = useState<"health" | "bills">("health");

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <h1 className="mb-4 text-[22px] font-semibold text-ink">{t("nav.templates")}</h1>

      <div className="mb-4 flex gap-1 border-b border-mist">
        <button
          onClick={() => setTab("health")}
          className={
            "border-b-2 px-3 py-2 text-[13px] font-medium " +
            (tab === "health" ? "border-ember text-ink" : "border-transparent text-ink-secondary hover:text-ink")
          }
        >
          {t("templatesPage.tabHealth")}
        </button>
        <button
          onClick={() => setTab("bills")}
          className={
            "border-b-2 px-3 py-2 text-[13px] font-medium " +
            (tab === "bills" ? "border-ember text-ink" : "border-transparent text-ink-secondary hover:text-ink")
          }
        >
          {t("templatesPage.tabBills")}
        </button>
      </div>

      {tab === "health" && <HealthTemplatesTab />}
      {tab === "bills" && <BillsTemplatesTab />}
    </div>
  );
}

function HealthTemplatesTab() {
  const { t } = useTranslations();
  const [subTab, setSubTab] = useState<"med" | "situation" | "email">("med");

  return (
    <div>
      <p className="mb-4 text-[14px] text-ink-secondary">{t("healthTemplatesPage.subtitle")}</p>

      <div className="mb-4 flex gap-1 border-b border-mist">
        <button
          onClick={() => setSubTab("med")}
          className={
            "border-b-2 px-3 py-2 text-[13px] font-medium " +
            (subTab === "med" ? "border-ember text-ink" : "border-transparent text-ink-secondary hover:text-ink")
          }
        >
          {t("healthTemplatesPage.tabMeds")}
        </button>
        <button
          onClick={() => setSubTab("situation")}
          className={
            "border-b-2 px-3 py-2 text-[13px] font-medium " +
            (subTab === "situation" ? "border-ember text-ink" : "border-transparent text-ink-secondary hover:text-ink")
          }
        >
          {t("healthTemplatesPage.tabSituations")}
        </button>
        <button
          onClick={() => setSubTab("email")}
          className={
            "border-b-2 px-3 py-2 text-[13px] font-medium " +
            (subTab === "email" ? "border-ember text-ink" : "border-transparent text-ink-secondary hover:text-ink")
          }
        >
          {t("healthTemplatesPage.tabEmail")}
        </button>
      </div>

      {subTab === "med" && <ListTemplateAdmin kind="med" scope="org" label={t("healthTemplatesPage.tabMeds")} />}
      {subTab === "situation" && (
        <ListTemplateAdmin kind="situation" scope="org" label={t("healthTemplatesPage.tabSituations")} />
      )}
      {subTab === "email" && <EmailTemplateAdmin scope="org" label={t("healthTemplatesPage.tabEmail")} />}
    </div>
  );
}

function BillsTemplatesTab() {
  const { t } = useTranslations();
  const [templates, setTemplates] = useState<CategoryTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/category-templates");
    if (res.ok) setTemplates(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;

    const res = await fetch("/api/category-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || t("categoryTemplates.errorAddFailed"));
      return;
    }

    setName("");
    load();
  }

  function startEdit(tpl: CategoryTemplateRow) {
    setError(null);
    setEditingId(tpl.id);
    setEditName(tpl.name);
    setEditDescription(tpl.description ?? "");
  }

  async function saveEdit(id: string) {
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/category-templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), description: editDescription.trim() || null }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(t("categoryTemplates.errorEditFailed"));
      return;
    }
    setEditingId(null);
    load();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/category-templates/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <p className="mb-4 text-[14px] text-ink-secondary">{t("categoryTemplates.subtitle")}</p>

      <form onSubmit={handleAdd} className="mb-6 flex gap-2">
        <input
          type="text"
          placeholder={t("categoryTemplates.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember"
        />
        <button type="submit" className="rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover">
          {t("common.add")}
        </button>
      </form>

      {error && <p className="mb-4 text-[14px] text-red-600">{error}</p>}

      {loading ? (
        <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
      ) : templates.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("categoryTemplates.empty")}</p>
      ) : (
        <ul className="list-none p-0">
          {templates.map((tpl) =>
            editingId === tpl.id ? (
              <li key={tpl.id} className="border-b border-mist/60 py-2.5">
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className={inputClass}
                    autoFocus
                  />
                  <input
                    type="text"
                    placeholder={t("categoryTemplates.descriptionPlaceholder")}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className={inputClass}
                  />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setEditingId(null)} className="text-[13px] text-ink-secondary hover:underline">
                      {t("common.cancel")}
                    </button>
                    <button type="button" onClick={() => saveEdit(tpl.id)} disabled={saving} className={btnPrimary}>
                      {t("common.save")}
                    </button>
                  </div>
                </div>
              </li>
            ) : (
              <li
                key={tpl.id}
                className="flex items-start justify-between gap-4 border-b border-mist/60 py-2.5"
              >
                <div>
                  <div className="text-[14px] font-medium text-ink">{tpl.name}</div>
                  {tpl.description && (
                    <div className="mt-0.5 text-[13px] text-ink-secondary">{tpl.description}</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button onClick={() => startEdit(tpl)} className="text-[13px] text-ember hover:underline">
                    {t("common.edit")}
                  </button>
                  <button onClick={() => handleDelete(tpl.id)} className="text-[13px] text-red-600 hover:underline">
                    {t("common.delete")}
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}
