"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";

type Template = { id: string; name: string; description: string | null };

export default function CategoryTemplatesPage() {
  const { t } = useTranslations();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

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

  async function handleDelete(id: string) {
    await fetch(`/api/category-templates/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <h1 className="mb-1 text-[22px] font-semibold text-ink">{t("categoryTemplates.title")}</h1>
      <p className="mb-4 text-[14px] text-ink-secondary">{t("categoryTemplates.subtitle")}</p>

      <form onSubmit={handleAdd} className="mb-6 flex gap-2">
        <input
          type="text"
          placeholder={t("categoryTemplates.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember"
        />
        <button
          type="submit"
          className="rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover"
        >
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
          {templates.map((tpl) => (
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
              <button
                onClick={() => handleDelete(tpl.id)}
                className="shrink-0 text-[13px] text-red-600 hover:underline"
              >
                {t("common.delete")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
