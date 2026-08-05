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
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "2rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.5rem" }}>
        {t("categoryTemplates.title")}
      </h1>
      <p style={{ color: "#666", marginBottom: "1rem" }}>
        {t("categoryTemplates.subtitle")}
      </p>

      <form onSubmit={handleAdd} style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        <input
          type="text"
          placeholder={t("categoryTemplates.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: 1, padding: "0.5rem", border: "1px solid #ccc", borderRadius: 4 }}
        />
        <button type="submit" style={{ padding: "0.5rem 1rem", background: "#111", color: "#fff", borderRadius: 4 }}>
          {t("common.add")}
        </button>
      </form>

      {error && <p style={{ color: "red", marginBottom: "1rem" }}>{error}</p>}

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : templates.length === 0 ? (
        <p>{t("categoryTemplates.empty")}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {templates.map((tpl) => (
            <li
              key={tpl.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                padding: "0.6rem 0",
                borderBottom: "1px solid #eee",
                gap: "1rem",
              }}
            >
              <div>
                <div style={{ fontWeight: 500 }}>{tpl.name}</div>
                {tpl.description && (
                  <div style={{ fontSize: "0.85rem", color: "#666", marginTop: "0.15rem" }}>
                    {tpl.description}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleDelete(tpl.id)}
                style={{ color: "#c00", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}
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
