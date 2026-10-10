"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import ListTemplateAdmin from "@/components/health/ListTemplateAdmin";
import ParticipantFieldAdmin from "@/components/participants/ParticipantFieldAdmin";
import EmailTemplateAdmin from "@/components/health/EmailTemplateAdmin";
import { REGISTRATION_ACCEPTANCE_PURPOSE_KEY, PORTAL_LINK_PURPOSE_KEY, PORTAL_INVITATION_PURPOSE_KEY, PARENT_SUMMARY_PURPOSE_KEY } from "@/lib/email-template-purpose-keys";
import { Synced } from "@/components/AppSyncPanel";
import { useConfirm } from "@/components/ConfirmDialog";
import { useLevelUrl } from "@/lib/template-level";

type CategoryTemplateRow = { id: string; name: string; description: string | null };

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

// Organizace -> Šablony and (inside TemplateLevelProvider value="app") Aplikace -> Šablony
// aplikace: the same sections, on the organization's or the app's templates (organizations step 4).
export default function TemplatesEditor({ titleKey, introKey }: { titleKey: string; introKey?: string }) {
  const { t } = useTranslations();
  const [tab, setTab] = useState<"health" | "mail" | "bills" | "participants" | "planning">("health");
  // ?tab=participants: the Lidé page's "Co vidí a upravují rodiče" link (slice 4 #9).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (new URLSearchParams(window.location.search).get("tab") === "participants") setTab("participants");
  }, []);

  const sections: { key: typeof tab; labelKey: string }[] = [
    { key: "health", labelKey: "templatesPage.tabHealth" },
    { key: "mail", labelKey: "templatesPage.tabMail" },
    { key: "bills", labelKey: "templatesPage.tabBills" },
    { key: "participants", labelKey: "templatesPage.tabParticipants" },
    { key: "planning", labelKey: "nav.planning" },
  ];

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <h1 className={"text-[22px] font-semibold text-ink " + (introKey ? "mb-1" : "mb-4")}>{t(titleKey)}</h1>
      {introKey && <p className="mb-4 text-[14px] text-ink-secondary">{t(introKey)}</p>}

      {/* Same layout as event settings: vertical menu, a select on narrow screens. */}
      <div className="flex flex-col gap-6 md:flex-row">
        <select
          value={tab}
          onChange={(e) => setTab(e.target.value as typeof tab)}
          className="w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink md:hidden"
        >
          {sections.map((s) => (
            <option key={s.key} value={s.key}>
              {t(s.labelKey)}
            </option>
          ))}
        </select>
        <nav className="hidden w-44 shrink-0 flex-col gap-0.5 self-start md:sticky md:top-4 md:flex">
          {sections.map((s) => (
            <button
              key={s.key}
              onClick={() => setTab(s.key)}
              className={
                "rounded-lg px-3 py-2 text-left text-[13px] font-medium " +
                (tab === s.key ? "bg-ember/15 text-ink" : "text-ink-secondary hover:bg-paper-2 hover:text-ink")
              }
            >
              {t(s.labelKey)}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
      {tab === "health" && <HealthTemplatesTab />}
      {tab === "mail" && <Synced table="list" filter="document"><ListTemplateAdmin kind="document" scope="org" label={t("templatesPage.tabMail")} /></Synced>}
      {tab === "bills" && <Synced table="category"><BillsTemplatesTab /></Synced>}
      {tab === "participants" && <Synced table="field"><ParticipantFieldAdmin scope="org" label={t("templatesPage.tabParticipants")} /></Synced>}
      {tab === "planning" && (
        <div className="flex flex-col gap-6">
          <p className="text-[14px] text-ink-secondary">{t("planLists.templatesSubtitle")}</p>
          <Synced table="list" filter="plan_activity"><ListTemplateAdmin kind="plan_activity" scope="org" label={t("planLists.baseLibraryLabel")} /></Synced>
          {/* Both category groups are kind plan_category: one panel for the two. */}
          <Synced table="list" filter="plan_category">
            <div className="flex flex-col gap-6">
              <ListTemplateAdmin kind="plan_category" scope="org" categoryGroup="primary" label={t("planLists.primaryCategoriesLabel")} />
              <ListTemplateAdmin kind="plan_category" scope="org" categoryGroup="secondary" label={t("planLists.secondaryCategoriesLabel")} />
            </div>
          </Synced>
          <Synced table="list" filter="plan_day_template"><ListTemplateAdmin kind="plan_day_template" scope="org" label={t("planLists.dayTemplatesLabel")} /></Synced>
          <Synced table="list" filter="plan_location"><ListTemplateAdmin kind="plan_location" scope="org" label={t("planLists.locationsLabel")} /></Synced>
          <Synced table="list" filter="plan_leader"><ListTemplateAdmin kind="plan_leader" scope="org" label={t("planLists.leadersLabel")} /></Synced>
        </div>
      )}
        </div>
      </div>
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

      {subTab === "med" && <Synced table="list" filter="med"><ListTemplateAdmin kind="med" scope="org" label={t("healthTemplatesPage.tabMeds")} /></Synced>}
      {subTab === "situation" && (
        <Synced table="list" filter="situation"><ListTemplateAdmin kind="situation" scope="org" label={t("healthTemplatesPage.tabSituations")} /></Synced>
      )}
      {subTab === "email" && (
        <div className="flex flex-col gap-6">
          <Synced table="email" filter={PARENT_SUMMARY_PURPOSE_KEY}><EmailTemplateAdmin scope="org" label={t("healthTemplatesPage.tabEmail")} /></Synced>
          <Synced table="email" filter={REGISTRATION_ACCEPTANCE_PURPOSE_KEY}>
            <EmailTemplateAdmin
              scope="org"
              purposeKey={REGISTRATION_ACCEPTANCE_PURPOSE_KEY}
              label={t("healthTemplatesPage.tabRegistrationEmail")}
            />
          </Synced>
          <Synced table="email" filter={PORTAL_LINK_PURPOSE_KEY}><EmailTemplateAdmin scope="org" purposeKey={PORTAL_LINK_PURPOSE_KEY} label={t("childProfile.portalLinkTemplate")} /></Synced>
          <Synced table="email" filter={PORTAL_INVITATION_PURPOSE_KEY}><EmailTemplateAdmin scope="org" purposeKey={PORTAL_INVITATION_PURPOSE_KEY} label={t("portalCompose.purpose.portal_invitation")} /></Synced>
        </div>
      )}
    </div>
  );
}

function BillsTemplatesTab() {
  const { t } = useTranslations();
  const lvl = useLevelUrl();
  const confirm = useConfirm();
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
    const res = await fetch(lvl("/api/category-templates"));
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

    const res = await fetch(lvl("/api/category-templates"), {
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
    const res = await fetch(lvl(`/api/category-templates/${id}`), {
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

  async function handleDelete(id: string, name: string) {
    if (!(await confirm({ message: t("categoryTemplates.confirmDelete", { name }), danger: true }))) return;
    await fetch(lvl(`/api/category-templates/${id}`), { method: "DELETE" });
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
                  <button onClick={() => handleDelete(tpl.id, tpl.name)} className="text-[13px] text-red-600 hover:underline">
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
