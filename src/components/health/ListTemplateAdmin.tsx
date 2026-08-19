"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";

type Kind = "med" | "slot" | "situation" | "document";
type IncidentCategory = "illness" | "injury" | "parasite" | "medication" | "other";

const CATEGORIES: IncidentCategory[] = ["illness", "injury", "parasite", "medication", "other"];

type SituationData = {
  category?: IncidentCategory;
  shortDescription?: string;
  defaultMed?: string;
  defaultTemp?: number;
  defaultDetails?: string;
};

type DocumentData = {
  displayName?: string;
  expectedValue?: string;
  filenameSuffix?: string;
};

type Item = {
  id: string;
  name: string;
  active: boolean;
  data: SituationData | DocumentData | null;
};

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

interface ListTemplateAdminProps {
  kind: Kind;
  scope: "org" | "event";
  eventId?: string;
  label: string;
}

export default function ListTemplateAdmin({ kind, scope, eventId, label }: ListTemplateAdminProps) {
  const { t } = useTranslations();
  const isSituation = kind === "situation";
  const isDocument = kind === "document";

  const basePath = scope === "org" ? "/api/list-templates" : `/api/events/${eventId}/list-items`;
  const listUrl = scope === "org" ? `${basePath}?kind=${kind}` : `${basePath}?kind=${kind}&all=true`;
  const itemUrl = (id: string) => `${basePath}/${id}`;

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<IncidentCategory>("illness");
  const [shortDescription, setShortDescription] = useState("");
  const [defaultMed, setDefaultMed] = useState("");
  const [defaultTemp, setDefaultTemp] = useState("");
  const [defaultDetails, setDefaultDetails] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [expectedValue, setExpectedValue] = useState("");
  const [filenameSuffix, setFilenameSuffix] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(listUrl);
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }

  async function syncFromTemplates() {
    if (scope !== "event") return;
    setSyncing(true);
    setError(null);
    const res = await fetch(`${basePath}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    setSyncing(false);
    if (!res.ok) {
      setError(t("listTemplateAdmin.errorSyncFailed"));
      return;
    }
    load();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, scope, eventId]);

  function resetForm() {
    setName("");
    setCategory("illness");
    setShortDescription("");
    setDefaultMed("");
    setDefaultTemp("");
    setDefaultDetails("");
    setDisplayName("");
    setExpectedValue("");
    setFilenameSuffix("");
    setEditingId(null);
  }

  function openAdd() {
    setError(null);
    resetForm();
    setFormOpen(true);
  }

  function openEdit(item: Item) {
    setError(null);
    setEditingId(item.id);
    setName(item.name);
    const situationData = item.data as SituationData | null;
    setCategory(situationData?.category ?? "illness");
    setShortDescription(situationData?.shortDescription ?? "");
    setDefaultMed(situationData?.defaultMed ?? "");
    setDefaultTemp(situationData?.defaultTemp !== undefined ? String(situationData.defaultTemp) : "");
    setDefaultDetails((item.data as SituationData | null)?.defaultDetails ?? "");
    setDisplayName((item.data as DocumentData | null)?.displayName ?? "");
    setExpectedValue((item.data as DocumentData | null)?.expectedValue ?? "");
    setFilenameSuffix((item.data as DocumentData | null)?.filenameSuffix ?? "");
    setFormOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    const data: SituationData | DocumentData | undefined = isSituation
      ? {
          category,
          shortDescription: shortDescription.trim() || undefined,
          defaultMed: defaultMed.trim() || undefined,
          defaultTemp: defaultTemp === "" ? undefined : Number(defaultTemp),
          defaultDetails: defaultDetails.trim() || undefined,
        }
      : isDocument
      ? {
          displayName: displayName.trim() || undefined,
          expectedValue: expectedValue.trim() || undefined,
          filenameSuffix: filenameSuffix.trim() || undefined,
        }
      : undefined;

    const payload = { kind, name: name.trim(), data };

    const res = editingId
      ? await fetch(itemUrl(editingId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), data }),
        })
      : await fetch(basePath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    setSaving(false);
    if (!res.ok) {
      setError(t("listTemplateAdmin.errorSaveFailed"));
      return;
    }
    setFormOpen(false);
    resetForm();
    load();
  }

  async function toggleActive(item: Item) {
    await fetch(itemUrl(item.id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !item.active }),
    });
    load();
  }

  async function handleDelete(item: Item) {
    if (!window.confirm(t("listTemplateAdmin.confirmDelete", { name: item.name }))) return;
    const res = await fetch(itemUrl(item.id), { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(
        body.error === "item_in_use"
          ? t("listTemplateAdmin.errorItemInUse")
          : t("listTemplateAdmin.errorDeleteFailed")
      );
      return;
    }
    load();
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-ink">{label}</h3>
        <div className="flex items-center gap-3">
          {scope === "event" && (
            <button
              onClick={syncFromTemplates}
              disabled={syncing}
              className="text-[13px] text-ink-secondary hover:text-ink disabled:opacity-50"
            >
              {syncing ? t("common.loading") : t("listTemplateAdmin.syncFromTemplates")}
            </button>
          )}
          <button onClick={openAdd} className="text-[13px] text-ember hover:underline">
            {t("common.add")}
          </button>
        </div>
      </div>

      {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}

      {loading ? (
        <p className="text-[13px] text-ink-secondary">{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <p className="mb-4 text-[13px] text-ink-secondary">{t("listTemplateAdmin.empty")}</p>
      ) : (
        <ul className="mb-4 list-none p-0">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 border-b border-mist/60 py-2"
            >
              <span className={"text-[14px] " + (item.active ? "text-ink" : "text-ink-secondary line-through")}>
                {item.name}
              </span>
              <div className="flex items-center gap-3">
                <button onClick={() => toggleActive(item)} className="text-[12px] text-ink-secondary hover:text-ink">
                  {item.active ? t("listTemplateAdmin.deactivate") : t("listTemplateAdmin.activate")}
                </button>
                <button onClick={() => openEdit(item)} className="text-[13px] text-ember hover:underline">
                  {t("common.edit")}
                </button>
                <button onClick={() => handleDelete(item)} className="text-[13px] text-red-600 hover:underline">
                  {t("common.delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="mb-4 flex flex-col gap-2 rounded-lg border border-mist bg-paper-2 p-3"
        >
          <input
            type="text"
            placeholder={t("common.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            autoFocus
          />
          {isSituation && (
            <>
              <select value={category} onChange={(e) => setCategory(e.target.value as IncidentCategory)} className={inputClass}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`incidentForm.category.${c}`)}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder={t("listTemplateAdmin.shortDescriptionLabel")}
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                className={inputClass}
              />
              <input
                type="text"
                placeholder={t("incidentForm.medLabel")}
                value={defaultMed}
                onChange={(e) => setDefaultMed(e.target.value)}
                className={inputClass}
              />
              <input
                type="number"
                step="0.1"
                placeholder={t("incidentForm.tempLabel")}
                value={defaultTemp}
                onChange={(e) => setDefaultTemp(e.target.value)}
                className={inputClass}
              />
              <textarea
                placeholder={t("incidentForm.detailsLabel")}
                value={defaultDetails}
                onChange={(e) => setDefaultDetails(e.target.value)}
                className={inputClass}
                rows={2}
              />
            </>
          )}
          {isDocument && (
            <>
              <input
                type="text"
                placeholder={t("listTemplateAdmin.displayNameLabel")}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={inputClass}
              />
              <input
                type="text"
                placeholder={t("listTemplateAdmin.expectedValueLabel")}
                value={expectedValue}
                onChange={(e) => setExpectedValue(e.target.value)}
                className={inputClass}
              />
              <input
                type="text"
                placeholder={t("listTemplateAdmin.filenameSuffixLabel")}
                value={filenameSuffix}
                onChange={(e) => setFilenameSuffix(e.target.value)}
                className={inputClass}
              />
            </>
          )}
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
    </div>
  );
}
