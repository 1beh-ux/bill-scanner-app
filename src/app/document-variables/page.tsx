"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n";

type SourceType = "participant_field" | "guardian_field" | "event_field" | "computed";

type MergeVariableRow = {
  key: string;
  sourceType: SourceType;
  sourceField: string;
  label: string;
  active: boolean;
};

const SOURCE_TYPES: SourceType[] = ["participant_field", "guardian_field", "event_field", "computed"];

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

export default function DocumentVariablesPage() {
  const { t, role: currentUserRole, roleLoaded } = useTranslations();
  const router = useRouter();

  const [rows, setRows] = useState<MergeVariableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("participant_field");
  const [sourceField, setSourceField] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (roleLoaded && currentUserRole !== "admin") {
      router.replace("/events");
    }
  }, [roleLoaded, currentUserRole, router]);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/document-variables");
    if (res.ok) setRows(await res.json());
    else setError(t("documentVariablesPage.errorSaveFailed"));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setKey("");
    setSourceType("participant_field");
    setSourceField("");
    setLabel("");
    setEditingKey(null);
  }

  function openAdd() {
    setError(null);
    resetForm();
    setFormOpen(true);
  }

  function openEdit(row: MergeVariableRow) {
    setError(null);
    setEditingKey(row.key);
    setKey(row.key);
    setSourceType(row.sourceType);
    setSourceField(row.sourceField);
    setLabel(row.label);
    setFormOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim() || !sourceField.trim() || !label.trim()) return;
    setSaving(true);
    setError(null);

    const res = editingKey
      ? await fetch(`/api/document-variables/${encodeURIComponent(editingKey)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceType, sourceField: sourceField.trim(), label: label.trim() }),
        })
      : await fetch("/api/document-variables", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: key.trim(), sourceType, sourceField: sourceField.trim(), label: label.trim() }),
        });

    setSaving(false);
    if (!res.ok) {
      setError(t("documentVariablesPage.errorSaveFailed"));
      return;
    }
    setFormOpen(false);
    resetForm();
    load();
  }

  async function toggleActive(row: MergeVariableRow) {
    await fetch(`/api/document-variables/${encodeURIComponent(row.key)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !row.active }),
    });
    load();
  }

  async function handleDelete(row: MergeVariableRow) {
    if (!window.confirm(t("documentVariablesPage.confirmDelete", { key: row.key }))) return;
    const res = await fetch(`/api/document-variables/${encodeURIComponent(row.key)}`, { method: "DELETE" });
    if (!res.ok) {
      setError(t("documentVariablesPage.errorDeleteFailed"));
      return;
    }
    load();
  }

  if (!roleLoaded || currentUserRole !== "admin") return null;

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[22px] font-semibold text-ink">{t("nav.documentVariables")}</h1>
        <button onClick={openAdd} className="text-[13px] text-ember hover:underline">
          {t("common.add")}
        </button>
      </div>
      <p className="mb-4 text-[13px] text-ink-secondary">{t("documentVariablesPage.intro")}</p>

      {error && <p className="mb-4 text-[14px] text-red-600">{error}</p>}

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="mb-4 flex flex-col gap-2 rounded-lg border border-mist bg-paper-2 p-3"
        >
          <input
            type="text"
            placeholder={t("documentVariablesPage.keyLabel")}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={!!editingKey}
            className={inputClass}
            autoFocus
          />
          <select value={sourceType} onChange={(e) => setSourceType(e.target.value as SourceType)} className={inputClass}>
            {SOURCE_TYPES.map((st) => (
              <option key={st} value={st}>
                {t(`documentVariablesPage.sourceType.${st}`)}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder={t("documentVariablesPage.sourceFieldLabel")}
            value={sourceField}
            onChange={(e) => setSourceField(e.target.value)}
            className={inputClass}
          />
          <input
            type="text"
            placeholder={t("documentVariablesPage.labelLabel")}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className={inputClass}
          />
          <div className="mt-1 flex justify-end gap-2">
            <button type="button" onClick={() => setFormOpen(false)} className="text-[13px] text-ink-secondary hover:underline">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {t("common.save")}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("documentVariablesPage.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-mist text-left">
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("documentVariablesPage.keyLabel")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("documentVariablesPage.sourceFieldLabel")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("documentVariablesPage.labelLabel")}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-mist/60">
                  <td className="p-2 align-top font-mono text-[12px] text-ink-secondary">{`{{${row.key}}}`}</td>
                  <td className="p-2 align-top text-[13px] text-ink">
                    {t(`documentVariablesPage.sourceType.${row.sourceType}`)} · {row.sourceField}
                  </td>
                  <td className={"p-2 align-top text-[13px] " + (row.active ? "text-ink" : "text-ink-secondary line-through")}>
                    {row.label}
                  </td>
                  <td className="whitespace-nowrap p-2 align-top">
                    <button onClick={() => toggleActive(row)} className="mr-3 text-[12px] text-ink-secondary hover:text-ink">
                      {row.active ? t("listTemplateAdmin.deactivate") : t("listTemplateAdmin.activate")}
                    </button>
                    <button onClick={() => openEdit(row)} className="mr-3 text-[13px] text-ember hover:underline">
                      {t("common.edit")}
                    </button>
                    <button onClick={() => handleDelete(row)} className="text-[13px] text-red-600 hover:underline">
                      {t("common.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
