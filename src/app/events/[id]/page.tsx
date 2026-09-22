"use client";

import { useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import ListTemplateAdmin from "@/components/health/ListTemplateAdmin";
import ParticipantFieldAdmin from "@/components/participants/ParticipantFieldAdmin";
import EmailTemplateAdmin from "@/components/health/EmailTemplateAdmin";
import SenderEmailField from "@/components/health/SenderEmailField";
import DriveSettingsTab from "@/components/events/DriveSettingsTab";
import { MAIL_HELPER_BULK_STATUS_PURPOSE_KEY, REGISTRATION_ACCEPTANCE_PURPOSE_KEY } from "@/lib/email-template-purpose-keys";
import { useConfirm } from "@/components/ConfirmDialog";

type EventDetail = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "active" | "closed";
  closedAt: string | null;
  driveIngestFolderId: string | null;
  driveExportFolderId: string | null;
  driveParticipantsFolderId: string | null;
  driveDocSyncEnabled: boolean;
  statusExportEnabled: boolean;
  statusExportSheetId: string | null;
  statusExportLastSyncedAt: string | null;
  memberPriceCzk: number | null;
  nonMemberPriceCzk: number | null;
  registrationBankAccountNumber: string | null;
  registrationBankCode: string | null;
  mailQuestionnaireUrl: string | null;
  registrationDeadline: string | null;
  senderEmail: string | null;
};

type Category = {
  id: string;
  name: string;
  description: string | null;
  budgetAmount: string;
  isFromTemplate: boolean;
};

type ModuleKey = "bills" | "health" | "mail";

type ModuleState = { moduleKey: ModuleKey; enabled: boolean };

type AccessRow = {
  id: string;
  displayName: string;
  email: string;
  role: "admin" | "accountant" | "user";
  access: Record<ModuleKey, boolean>;
};

const MODULE_KEYS: ModuleKey[] = ["bills", "health", "mail"];

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

// Part 5/10 of the participants/settings/Health/Mail prompt: a left section list
// replaces the old horizontal tab row, regrouped by topic (the old grouping mixed
// event data, connections and templates on the same tab -- e.g. the sender mailbox
// used to appear on both "Zdraví" and "Pošta", camp fee lived under "Pošta"). Old
// `?tab=` values still work via OLD_TAB_MAP below -- nothing that links here needed
// to change, including bookmarks and the mail-oauth callback redirect.
type Tab = "akce" | "lide" | "pripojeni" | "uctenky" | "ucastnici" | "zdravi" | "posta";
const SECTION_KEYS: Tab[] = ["akce", "lide", "pripojeni", "uctenky", "ucastnici", "zdravi", "posta"];
const OLD_TAB_MAP: Record<string, Tab> = {
  categories: "uctenky",
  drive: "pripojeni",
  access: "lide",
  health: "zdravi",
  mail: "posta",
  modules: "akce",
  participants: "ucastnici",
};

export default function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t, role } = useTranslations();
  const confirm = useConfirm();
  const isAdmin = role === "admin";
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const mailConnect = searchParams.get("mailConnect");
  const driveConnect = searchParams.get("driveConnect");

  const [tab, setTab] = useState<Tab>(() => {
    if (!requestedTab) return "akce";
    return OLD_TAB_MAP[requestedTab] ?? (SECTION_KEYS.includes(requestedTab as Tab) ? (requestedTab as Tab) : "akce");
  });
  const [moduleAccess, setModuleAccess] = useState<Record<string, boolean>>({});

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [syncingCategories, setSyncingCategories] = useState(false);


  const [memberPriceCzk, setMemberPriceCzk] = useState("");
  const [nonMemberPriceCzk, setNonMemberPriceCzk] = useState("");
  const [registrationBankAccountNumber, setRegistrationBankAccountNumber] = useState("");
  const [registrationBankCode, setRegistrationBankCode] = useState("");
  const [registrationDeadline, setRegistrationDeadline] = useState("");
  const [feeError, setFeeError] = useState<string | null>(null);
  const [feeSaving, setFeeSaving] = useState(false);

  const [mailQuestionnaireUrl, setMailQuestionnaireUrl] = useState("");
  const [questionnaireSaving, setQuestionnaireSaving] = useState(false);
  const [questionnaireSaved, setQuestionnaireSaved] = useState(false);


  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

  // Setup checklist (Part 10 §4): kept to a few objectively checkable signals rather
  // than the full 7-item list the brief sketches -- "pole účastníků nastavena" and
  // "e-mailové šablony zkontrolovány" have no clean yes/no signal in the data model,
  // so they're left out rather than faked. Each item links to the section that fixes it.
  const [documentTypeCount, setDocumentTypeCount] = useState<number | null>(null);
  useEffect(() => {
    if (!moduleAccess.mail) return;
    fetch(`/api/events/${id}/list-items?kind=document&all=false`)
      .then((r) => (r.ok ? r.json() : []))
      .then((items: unknown[]) => setDocumentTypeCount(items.length))
      .catch(() => {});
  }, [id, moduleAccess.mail]);

  async function load() {
    setLoading(true);
    const [evRes, catRes] = await Promise.all([
      fetch(`/api/events/${id}`),
      fetch(`/api/events/${id}/categories`),
    ]);
    if (evRes.ok) setEvent(await evRes.json());
    if (catRes.ok) setCategories(await catRes.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    fetch(`/api/events/${id}/modules/mine`)
      .then((r) => (r.ok ? r.json() : {}))
      .then(setModuleAccess)
      .catch(() => setModuleAccess({}));
  }, [id]);

  useEffect(() => {
    if (tab === "zdravi" && !moduleAccess.health) setTab("akce");
    if (tab === "posta" && !moduleAccess.mail) setTab("akce");
    if (tab === "ucastnici" && !moduleAccess.health && !moduleAccess.mail) setTab("akce");
  }, [tab, moduleAccess]);

  useEffect(() => {
    if (event) {
      setMemberPriceCzk(event.memberPriceCzk != null ? String(event.memberPriceCzk) : "");
      setNonMemberPriceCzk(event.nonMemberPriceCzk != null ? String(event.nonMemberPriceCzk) : "");
      setRegistrationBankAccountNumber(event.registrationBankAccountNumber ?? "");
      setRegistrationBankCode(event.registrationBankCode ?? "");
      setMailQuestionnaireUrl(event.mailQuestionnaireUrl ?? "");
      setRegistrationDeadline(event.registrationDeadline ? event.registrationDeadline.slice(0, 10) : "");
    }
  }, [event?.id]);

  async function handleSaveQuestionnaireUrl(e: React.FormEvent) {
    e.preventDefault();
    setQuestionnaireSaving(true);
    setQuestionnaireSaved(false);
    await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mailQuestionnaireUrl: mailQuestionnaireUrl.trim() || null }),
    });
    setQuestionnaireSaving(false);
    setQuestionnaireSaved(true);
  }

  async function handleSaveFeeSettings(e: React.FormEvent) {
    e.preventDefault();
    setFeeError(null);
    setFeeSaving(true);
    const res = await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberPriceCzk: memberPriceCzk.trim() === "" ? null : Number(memberPriceCzk),
        nonMemberPriceCzk: nonMemberPriceCzk.trim() === "" ? null : Number(nonMemberPriceCzk),
        registrationBankAccountNumber: registrationBankAccountNumber.trim() || null,
        registrationBankCode: registrationBankCode.trim() || null,
        registrationDeadline: registrationDeadline || null,
      }),
    });
    setFeeSaving(false);
    if (!res.ok) {
      setFeeError(t("feeSettings.errorSaveFailed"));
      return;
    }
    load();
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setEditValue(cat.budgetAmount);
  }

  async function saveBudget(catId: string) {
    setError(null);
    const res = await fetch(`/api/event-categories/${catId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budgetAmount: editValue }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || t("eventDetail.errorSaveBudget"));
      return;
    }
    setEditingId(null);
    load();
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newCategoryName.trim()) return;

    const res = await fetch(`/api/events/${id}/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCategoryName.trim() }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || t("eventDetail.errorAddCategory"));
      return;
    }

    setNewCategoryName("");
    load();
  }

  async function handleDeleteCategory(catId: string) {
    if (!(await confirm({ message: t("eventDetail.confirmDeleteCategory"), danger: true }))) return;
    await fetch(`/api/event-categories/${catId}`, { method: "DELETE" });
    load();
  }

  async function syncCategoriesFromTemplates() {
    setSyncingCategories(true);
    setError(null);
    const res = await fetch(`/api/events/${id}/categories/sync`, { method: "POST" });
    setSyncingCategories(false);
    if (!res.ok) {
      setError(t("eventDetail.errorSyncFailed"));
      return;
    }
    load();
  }

  async function handleClose() {
    if (!(await confirm({ message: t("eventDetail.confirmClose") }))) return;
    setLifecycleError(null);
    setLifecycleBusy(true);
    const res = await fetch(`/api/events/${id}/close`, { method: "POST" });
    setLifecycleBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setLifecycleError(data.error || "lifecycleGeneric");
      return;
    }
    load();
  }

  async function handleReopen() {
    if (!(await confirm({ message: t("eventDetail.confirmReopen") }))) return;
    setLifecycleError(null);
    setLifecycleBusy(true);
    const res = await fetch(`/api/events/${id}/reopen`, { method: "POST" });
    setLifecycleBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setLifecycleError(data.error || "lifecycleGeneric");
      return;
    }
    load();
  }

  if (loading) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  if (!event) return <div className="p-8 text-[14px] text-ink-secondary">{t("eventDetail.notFound")}</div>;

  const totalBudget = categories.reduce((sum, c) => sum + parseFloat(c.budgetAmount || "0"), 0);

  const checklist: { labelKey: string; done: boolean; section: Tab }[] = [
    { labelKey: "eventDetail.checklistDrive", done: !!(event.driveIngestFolderId || event.driveExportFolderId), section: "pripojeni" },
    { labelKey: "eventDetail.checklistMailbox", done: !!event.senderEmail, section: "pripojeni" },
    { labelKey: "eventDetail.checklistCategories", done: categories.length > 0, section: "uctenky" },
    ...(moduleAccess.mail
      ? [{ labelKey: "eventDetail.checklistDocumentTypes", done: (documentTypeCount ?? 0) > 0, section: "posta" as Tab }]
      : []),
    { labelKey: "eventDetail.checklistDeadline", done: !!event.registrationDeadline, section: "akce" },
  ];
  const checklistDone = checklist.filter((c) => c.done).length;

  const visibleSections: { key: Tab; labelKey: string }[] = [
    { key: "akce", labelKey: "eventSettings.tabAkce" },
    ...(isAdmin ? [{ key: "lide" as Tab, labelKey: "eventSettings.tabAccess" }] : []),
    { key: "pripojeni", labelKey: "eventSettings.tabPripojeni" },
    { key: "uctenky", labelKey: "eventSettings.tabUctenky" },
    ...(moduleAccess.health || moduleAccess.mail ? [{ key: "ucastnici" as Tab, labelKey: "eventSettings.tabParticipants" }] : []),
    ...(moduleAccess.health ? [{ key: "zdravi" as Tab, labelKey: "eventSettings.tabHealth" }] : []),
    ...(moduleAccess.mail ? [{ key: "posta" as Tab, labelKey: "eventSettings.tabMail" }] : []),
  ];

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <a href="/events" className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("eventDetail.back")}
      </a>

      <h1 className="mb-1 mt-2 text-[22px] font-semibold text-ink">{event.name}</h1>
      <p className="mb-3 text-[14px] text-ink-secondary">
        {new Date(event.startDate).toLocaleDateString("cs-CZ")} –{" "}
        {new Date(event.endDate).toLocaleDateString("cs-CZ")} ·{" "}
        {event.status === "active" ? t("common.statusActive") : t("common.statusClosed")}
        {event.status === "closed" && event.closedAt && (
          <> · {t("eventDetail.closedAtLabel", { date: new Date(event.closedAt).toLocaleDateString("cs-CZ") })}</>
        )}
      </p>

      <div className="mb-4">
        {event.status === "active" ? (
          <button
            onClick={handleClose}
            disabled={lifecycleBusy}
            className="rounded-lg border border-red-300 bg-paper-2 px-3 py-1.5 text-[13px] text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {t("eventDetail.closeButton")}
          </button>
        ) : (
          <button
            onClick={handleReopen}
            disabled={lifecycleBusy}
            className="rounded-lg border border-pine/40 bg-paper-2 px-3 py-1.5 text-[13px] text-pine hover:bg-pine-bg disabled:opacity-50"
          >
            {t("eventDetail.reopenButton")}
          </button>
        )}
        {lifecycleError && <p className="mt-1.5 text-[13px] text-red-600">{t(`eventDetail.error.${lifecycleError}`)}</p>}
      </div>

      <div className="mb-6 rounded-lg border border-mist bg-paper-2 p-3">
        <p className="mb-2 text-[13px] font-medium text-ink">
          {t("eventDetail.checklistTitle", { done: String(checklistDone), total: String(checklist.length) })}
        </p>
        <div className="flex flex-wrap gap-2">
          {checklist.map((item) => (
            <button
              key={item.labelKey}
              onClick={() => setTab(item.section)}
              className={
                "rounded-full px-2.5 py-0.5 text-[12px] " +
                (item.done ? "bg-pine/15 text-pine" : "bg-amber-100 text-amber-800 hover:bg-amber-200")
              }
            >
              {item.done ? "✓ " : ""}
              {t(item.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        {/* Narrow screens: a select instead of the vertical list (Part 5: "works on
            narrow screens as a select"). */}
        <select
          value={tab}
          onChange={(e) => setTab(e.target.value as Tab)}
          className={inputClass + " md:hidden"}
        >
          {visibleSections.map((s) => (
            <option key={s.key} value={s.key}>
              {t(s.labelKey)}
            </option>
          ))}
        </select>
        <nav className="hidden w-44 shrink-0 flex-col gap-0.5 self-start md:sticky md:top-4 md:flex">
          {visibleSections.map((s) => (
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
          {tab === "akce" && (
            <div className="flex flex-col gap-6">
              {isAdmin && <ModulesTab eventId={id} t={t} />}
              <div>
                <h3 className="mb-3 text-[15px] font-semibold text-ink">{t("feeSettings.title")}</h3>
                {feeError && <p className="mb-3 text-[13px] text-red-600">{feeError}</p>}
                <form onSubmit={handleSaveFeeSettings} className="flex max-w-md flex-col gap-2">
                  <input
                    type="number"
                    placeholder={t("feeSettings.memberPriceLabel")}
                    value={memberPriceCzk}
                    onChange={(e) => setMemberPriceCzk(e.target.value)}
                    className={inputClass}
                  />
                  <input
                    type="number"
                    placeholder={t("feeSettings.nonMemberPriceLabel")}
                    value={nonMemberPriceCzk}
                    onChange={(e) => setNonMemberPriceCzk(e.target.value)}
                    className={inputClass}
                  />
                  <input
                    type="text"
                    placeholder={t("feeSettings.bankAccountLabel")}
                    value={registrationBankAccountNumber}
                    onChange={(e) => setRegistrationBankAccountNumber(e.target.value)}
                    className={inputClass}
                  />
                  <input
                    type="text"
                    placeholder={t("feeSettings.bankCodeLabel")}
                    value={registrationBankCode}
                    onChange={(e) => setRegistrationBankCode(e.target.value)}
                    className={inputClass}
                  />
                  <label className="text-[13px] text-ink-secondary">
                    {t("eventDetail.registrationDeadlineLabel")}
                    <input
                      type="date"
                      value={registrationDeadline}
                      onChange={(e) => setRegistrationDeadline(e.target.value)}
                      className={inputClass + " mt-1"}
                    />
                  </label>
                  <div className="mt-1 flex justify-end">
                    <button type="submit" disabled={feeSaving} className={btnPrimary}>
                      {t("common.save")}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {tab === "lide" && isAdmin && <AccessTab eventId={id} t={t} />}

          {tab === "pripojeni" && (
            <div className="flex flex-col gap-6">
              {mailConnect === "connected" && (
                <p className="rounded-lg bg-green-50 px-3 py-2 text-[13px] text-green-700">
                  {t("senderEmailField.connectSuccessBanner")}
                </p>
              )}
              {mailConnect === "error" && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
                  {t("senderEmailField.connectErrorBanner")}
                </p>
              )}
              <DriveSettingsTab eventId={id} event={event} driveConnect={driveConnect} onSaved={load} />
              {/* One control for both modules now (Part 5: "not repeated elsewhere") -- the
                  gmail.modify scope warning only matters when Mail is enabled (it reads/
                  moves inbound mail; Health only ever sends), so purpose follows that. */}
              {(moduleAccess.health || moduleAccess.mail) && (
                <SenderEmailField eventId={id} purpose={moduleAccess.mail ? "mail" : "health"} />
              )}
            </div>
          )}

          {tab === "uctenky" && (
            <>
              {error && <p className="mb-4 text-[14px] text-red-600">{error}</p>}

              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[16px] font-semibold text-ink">{t("eventDetail.categoriesTitle")}</h2>
                <button
                  onClick={syncCategoriesFromTemplates}
                  disabled={syncingCategories}
                  className="text-[13px] text-ink-secondary hover:text-ink disabled:opacity-50"
                >
                  {syncingCategories ? t("common.loading") : t("eventDetail.syncFromTemplates")}
                </button>
              </div>

              <div className="mb-6 overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse">
                  <thead>
                    <tr className="border-b border-mist text-left">
                      <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("eventDetail.colCategory")}</th>
                      <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("eventDetail.colBudget")}</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((cat) => (
                      <tr key={cat.id} className="border-b border-mist/60">
                        <td className="p-2 text-[14px] text-ink">
                          <div>{cat.name}</div>
                          {cat.description && <div className="text-[12px] text-ink-secondary">{cat.description}</div>}
                        </td>
                        <td className="p-2 text-[14px] text-ink">
                          {editingId === cat.id ? (
                            <input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-24 rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember"
                              autoFocus
                            />
                          ) : (
                            <span>{parseFloat(cat.budgetAmount).toLocaleString("cs-CZ")}</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap p-2">
                          {editingId === cat.id ? (
                            <>
                              <button onClick={() => saveBudget(cat.id)} className="mr-3 text-[13px] text-pine hover:underline">
                                {t("common.save")}
                              </button>
                              <button onClick={() => setEditingId(null)} className="text-[13px] text-ink-secondary hover:underline">
                                {t("common.cancel")}
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEdit(cat)} className="mr-3 text-[13px] text-ember hover:underline">
                                {t("common.edit")}
                              </button>
                              <button onClick={() => handleDeleteCategory(cat.id)} className="text-[13px] text-red-600 hover:underline">
                                {t("common.delete")}
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="p-2 text-[14px] font-semibold text-ink">{t("eventDetail.total")}</td>
                      <td className="p-2 text-[14px] font-semibold text-ink">{totalBudget.toLocaleString("cs-CZ")} Kč</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <form onSubmit={handleAddCategory} className="mb-8 flex gap-2">
                <input
                  type="text"
                  placeholder={t("eventDetail.newCategoryPlaceholder")}
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-1 rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember"
                />
                <button type="submit" className={btnPrimary}>
                  {t("eventDetail.addCategory")}
                </button>
              </form>
            </>
          )}

          {tab === "ucastnici" && (moduleAccess.health || moduleAccess.mail) && (
            <div className="flex flex-col gap-6">
              <ParticipantFieldAdmin scope="event" eventId={id} label={t("eventSettings.tabParticipants")} />
              <EmailTemplateAdmin
                scope="event"
                eventId={id}
                purposeKey={REGISTRATION_ACCEPTANCE_PURPOSE_KEY}
                label={t("healthTemplatesPage.tabRegistrationEmail")}
              />
              <div>
                <h3 className="mb-3 text-[15px] font-semibold text-ink">{t("mailTab.questionnaireTitle")}</h3>
                <p className="mb-2 text-[12px] text-ink-secondary">{t("mailTab.questionnaireHint")}</p>
                <form onSubmit={handleSaveQuestionnaireUrl} className="flex max-w-md flex-col gap-2">
                  <input
                    type="url"
                    placeholder={t("mailTab.questionnaireUrlLabel")}
                    value={mailQuestionnaireUrl}
                    onChange={(e) => {
                      setMailQuestionnaireUrl(e.target.value);
                      setQuestionnaireSaved(false);
                    }}
                    className={inputClass}
                  />
                  <div className="mt-1 flex items-center gap-3">
                    <button type="submit" disabled={questionnaireSaving} className={btnPrimary}>
                      {questionnaireSaving ? t("common.loading") : t("common.save")}
                    </button>
                    {questionnaireSaved && <span className="text-[13px] text-pine">{t("settingsPage.saved")}</span>}
                  </div>
                </form>
              </div>
            </div>
          )}

          {tab === "zdravi" && moduleAccess.health && (
            <div className="flex flex-col gap-6">
              <ListTemplateAdmin kind="med" scope="event" eventId={id} label={t("healthTemplatesPage.tabMeds")} />
              <ListTemplateAdmin kind="slot" scope="event" eventId={id} label={t("eventHealthTab.slotsLabel")} />
              <ListTemplateAdmin kind="situation" scope="event" eventId={id} label={t("healthTemplatesPage.tabSituations")} />
              <EmailTemplateAdmin scope="event" eventId={id} label={t("healthTemplatesPage.tabEmail")} />
              <div>
                <a href={`/events/${id}/health/send-summaries`} className="text-[13px] text-ember hover:underline">
                  {t("bulkSendSummaries.entryPoint")}
                </a>
              </div>
            </div>
          )}

          {tab === "posta" && moduleAccess.mail && (
            <div className="flex flex-col gap-6">
              <ListTemplateAdmin kind="document" scope="event" eventId={id} label={t("templatesPage.tabMail")} />
              <EmailTemplateAdmin
                scope="event"
                eventId={id}
                purposeKey={MAIL_HELPER_BULK_STATUS_PURPOSE_KEY}
                label={t("mailTab.bulkStatusTemplateLabel")}
              />
              <MailSyncSettings eventId={id} event={event} onSynced={load} t={t} />
              <div>
                <a href={`/events/${id}/mail`} className="text-[13px] text-ember hover:underline">
                  {t("mailTab.openInboxLink")}
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MailSyncSettings({
  eventId,
  event,
  onSynced,
  t,
}: {
  eventId: string;
  event: EventDetail | null;
  onSynced: () => void;
  t: (key: string, vars?: Record<string, string>) => string;
}) {
  const [syncingDrive, setSyncingDrive] = useState(false);
  const [syncingSheets, setSyncingSheets] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(field: "driveDocSyncEnabled" | "statusExportEnabled", enabled: boolean) {
    setError(null);
    const res = await fetch(`/api/events/${eventId}/mail/sync-settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: enabled }),
    });
    if (!res.ok) {
      setError(t("mailTab.syncSettingsErrorSaveFailed"));
      return;
    }
    onSynced();
  }

  async function syncNow(kind: "drive" | "sheets") {
    setError(null);
    if (kind === "drive") setSyncingDrive(true);
    else setSyncingSheets(true);
    const res = await fetch(`/api/events/${eventId}/mail/${kind}-sync`, { method: "POST" });
    if (kind === "drive") setSyncingDrive(false);
    else setSyncingSheets(false);
    if (!res.ok) {
      setError(t("mailTab.syncNowFailed"));
      return;
    }
    onSynced();
  }

  if (!event) return null;

  return (
    <div>
      <h3 className="mb-1 text-[15px] font-semibold text-ink">{t("mailTab.syncSettingsTitle")}</h3>
      <p className="mb-3 text-[13px] text-amber-600">{t("mailTab.syncOneWayWarning")}</p>
      {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[14px] text-ink">
          <input
            type="checkbox"
            checked={event.driveDocSyncEnabled}
            onChange={(e) => toggle("driveDocSyncEnabled", e.target.checked)}
          />
          {t("mailTab.driveSyncEnabledLabel")}
        </label>
        <button
          onClick={() => syncNow("drive")}
          disabled={syncingDrive || !event.driveDocSyncEnabled}
          className="rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink hover:bg-mist disabled:opacity-50"
        >
          {syncingDrive ? t("common.loading") : t("mailTab.syncNowButton")}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[14px] text-ink">
          <input
            type="checkbox"
            checked={event.statusExportEnabled}
            onChange={(e) => toggle("statusExportEnabled", e.target.checked)}
          />
          {t("mailTab.statusExportEnabledLabel")}
        </label>
        <button
          onClick={() => syncNow("sheets")}
          disabled={syncingSheets || !event.statusExportEnabled}
          className="rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink hover:bg-mist disabled:opacity-50"
        >
          {syncingSheets ? t("common.loading") : t("mailTab.syncNowButton")}
        </button>
        {event.statusExportSheetId && (
          <a
            href={`https://docs.google.com/spreadsheets/d/${event.statusExportSheetId}`}
            target="_blank"
            rel="noreferrer"
            className="text-[13px] text-ember hover:underline"
          >
            {t("mailTab.openSheetLink")}
          </a>
        )}
      </div>
      {event.statusExportLastSyncedAt && (
        <p className="mt-2 text-[12px] text-ink-secondary">
          {t("mailTab.lastSyncedAt", { date: new Date(event.statusExportLastSyncedAt).toLocaleString("cs-CZ") })}
        </p>
      )}
    </div>
  );
}

function ModulesTab({ eventId, t }: { eventId: string; t: (key: string, vars?: Record<string, string>) => string }) {
  const [modules, setModules] = useState<ModuleState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/events/${eventId}/modules`);
    if (res.ok) setModules(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [eventId]);

  async function toggleModule(moduleKey: ModuleKey, enabled: boolean) {
    setError(null);
    const res = await fetch(`/api/events/${eventId}/modules`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleKey, enabled }),
    });
    if (!res.ok) {
      setError(t("accessTab.errorSaveFailed"));
      return;
    }
    load();
  }

  if (loading) return <div className="p-4 text-[14px] text-ink-secondary">{t("common.loading")}</div>;

  const moduleLabel = (key: ModuleKey) =>
    key === "bills" ? t("accessTab.moduleBills") : key === "health" ? t("accessTab.moduleHealth") : t("accessTab.moduleMail");

  return (
    <div>
      {error && <p className="mb-4 text-[14px] text-red-600">{error}</p>}

      <h2 className="mb-1 text-[16px] font-semibold text-ink">{t("accessTab.modulesTitle")}</h2>
      <p className="mb-3 text-[12px] text-ink-secondary">{t("accessTab.modulesHelp")}</p>
      <div className="flex flex-col gap-2">
        {modules.map((m) => (
          <label key={m.moduleKey} className="flex items-center gap-2 text-[14px] text-ink">
            <input
              type="checkbox"
              checked={m.enabled}
              onChange={(e) => toggleModule(m.moduleKey, e.target.checked)}
              className="h-4 w-4"
            />
            {moduleLabel(m.moduleKey)}
            <span className="text-[12px] text-ink-secondary">
              ({m.enabled ? t("accessTab.moduleOn") : t("accessTab.moduleOff")})
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function AccessTab({ eventId, t }: { eventId: string; t: (key: string, vars?: Record<string, string>) => string }) {
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const accessRes = await fetch(`/api/events/${eventId}/module-access`);
    if (accessRes.ok) {
      setRows(await accessRes.json());
    } else if (accessRes.status === 403) {
      // Non-admins can't see the user access grid.
      setRows([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [eventId]);

  async function toggleGrant(userId: string, moduleKey: ModuleKey, grant: boolean) {
    setError(null);
    const res = await fetch(`/api/events/${eventId}/module-access`, {
      method: grant ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, moduleKey }),
    });
    if (!res.ok) {
      setError(t("accessTab.errorSaveFailed"));
      return;
    }
    load();
  }

  if (loading) return <div className="p-4 text-[14px] text-ink-secondary">{t("common.loading")}</div>;

  const moduleLabel = (key: ModuleKey) =>
    key === "bills" ? t("accessTab.moduleBills") : key === "health" ? t("accessTab.moduleHealth") : t("accessTab.moduleMail");

  return (
    <div>
      {error && <p className="mb-4 text-[14px] text-red-600">{error}</p>}

      {rows.length > 0 && (
        <>
          <h2 className="mb-1 text-[16px] font-semibold text-ink">{t("accessTab.usersTitle")}</h2>
          <p className="mb-3 text-[12px] text-ink-secondary">{t("accessTab.usersHelp")}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse">
              <thead>
                <tr className="border-b border-mist text-left">
                  <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("accessTab.colUser")}</th>
                  {MODULE_KEYS.map((key) => (
                    <th key={key} className="p-2 text-[12px] font-medium text-ink-secondary">
                      {moduleLabel(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-mist/60">
                    <td className="p-2 text-[14px] text-ink">
                      {row.displayName}
                      <div className="text-[12px] text-ink-secondary">{row.email}</div>
                    </td>
                    {MODULE_KEYS.map((key) => {
                      return (
                        <td key={key} className="p-2 text-[14px] text-ink">
                          {row.role === "admin" ? (
                            <span className="text-[12px] text-ink-secondary">{t("accessTab.shortcutAdmin")}</span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={row.access[key]}
                              onChange={(e) => toggleGrant(row.id, key, e.target.checked)}
                              className="h-4 w-4"
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
