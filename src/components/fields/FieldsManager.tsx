"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import FieldsOverview from "./FieldsOverview";
import FieldsList from "./FieldsList";
import FieldsTable from "./FieldsTable";
import DetailPanel, { PortalLevels } from "./DetailPanel";
import FormView from "./FormView";
import ImportWizard from "./ImportWizard";
import ReviewQueue from "./ReviewQueue";
import DocumentEditor from "./DocumentEditor";
import CleanupPanel from "./CleanupPanel";
import type { FmDocTemplate, FmOverview } from "./types";

// Organizace -> Pole (Fields Manager, phase 2: read-only). Tab, event and selection live in the URL
// (?tab=&event=&key=) so links and the back button work. Behind the organization flag "fields_manager".
// Redesign R7: Přehled and Pole are one screen ("overview", diagram or list view); ?tab=list still opens it.
// Round 2: "Kde se používá" is the list view itself (an editable table); ?tab=usage opens it.
// Rethink (2026-11-24): Formulář (the form as the applicant sees it) · Portál (what parents see) · Údaje (the data
// table, map on demand) · Nástroje (import, review queue, documents, clean-up). Older ?tab= links still land right.
const TABS = ["form", "portal", "data", "tools"] as const;
type Tab = (typeof TABS)[number];
const TOOLS = ["import", "review", "documents", "cleanup"] as const;
type Tool = (typeof TOOLS)[number];
const OLD_TAB: Record<string, [Tab, Tool?]> = { overview: ["data"], list: ["data"], usage: ["data"], documents: ["tools", "documents"], import: ["tools", "import"], review: ["tools", "review"], cleanup: ["tools", "cleanup"] };
const SURFACE_USES = new Set(["lists", "health", "mail", "email", "documents"]);

export default function FieldsManager() {
  const { t, role, roleLoaded, features } = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const rawTab = params.get("tab") ?? "";
  const tab: Tab = (TABS as readonly string[]).includes(rawTab) ? (rawTab as Tab) : (OLD_TAB[rawTab]?.[0] ?? "form");
  const tool: Tool = (TOOLS as readonly string[]).includes(params.get("tool") ?? "") ? (params.get("tool") as Tool) : (OLD_TAB[rawTab]?.[1] ?? "import");
  // Údaje: the table by default, the map (diagram) on demand.
  const view = params.get("view") === "map" ? "diagram" : "list";
  const eventParam = params.get("event");
  const key = params.get("key");

  const [data, setData] = useState<FmOverview | null>(null);
  const [failed, setFailed] = useState(false);
  const [docs, setDocs] = useState<FmDocTemplate[] | null>(null);
  const [reload, setReload] = useState(0);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const refresh = useCallback(() => setReload((n) => n + 1), []);

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  useEffect(() => {
    const q = eventParam ? `?event=${encodeURIComponent(eventParam)}` : "";
    let gone = false;
    fetch(`/api/fields/overview${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: FmOverview) => {
        if (gone) return;
        setData(d);
        setFailed(false);
        setDocs(null);
        // The template check reads Google Docs: loaded after the overview, never blocking it.
        if (d.eventId)
          fetch(`/api/fields/documents?event=${encodeURIComponent(d.eventId)}`)
            .then((r) => (r.ok ? r.json() : { templates: [] }))
            .then((x: { templates: FmDocTemplate[] }) => !gone && setDocs(x.templates))
            .catch(() => !gone && setDocs([]));
      })
      .catch(() => !gone && setFailed(true));
    return () => {
      gone = true;
    };
  }, [eventParam, reload]);

  if (roleLoaded && (role !== "admin" || !features.includes("fields_manager"))) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.adminOnly")}</div>;
  if (failed) return <div className="p-8 text-[14px] text-ink-secondary">{t("fieldsManager.loadFailed")}</div>;
  if (!data) return <div className="p-8 text-[14px] text-ink-secondary">{t("fieldsManager.loading")}</div>;

  const setSlots = (n: number) =>
    fetch("/api/fields/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ guardianSlots: n }) })
      .catch(() => null)
      .then(refresh);
  const selectNode = (id: string | null) => {
    setCreating(false);
    setParams({ key: id?.startsWith("field:") ? id.slice(6) : null, node: id });
  };
  const node = params.get("node") ?? (key ? `field:${key}` : null);
  /** One change from the panel or a Ctrl-click: saved at once; `undo` (the reverse change) offered in the bar. */
  const patchField = async (k: string, body: Record<string, unknown>, undo?: Record<string, unknown>) => {
    const res = await fetch(`/api/fields/${encodeURIComponent(k)}?event=${encodeURIComponent(data.eventId ?? "")}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (!res?.ok) {
      setToast({ text: t("fieldsManager.saveFailed") });
      return false;
    }
    refresh();
    setToast({ text: t("fieldsManager.savedChange", { key: k }), undo: undo ? () => void patchField(k, undo).then(() => setToast(null)) : undefined });
    return true;
  };
  // R13: Ctrl/⌘-click -- the selected field and a place (or the other way round) are connected / disconnected.
  const connect = (selected: string, clicked: string) => {
    const fieldId = selected.startsWith("field:") ? selected : clicked.startsWith("field:") ? clicked : null;
    const otherId = fieldId === selected ? clicked : selected;
    const f = fieldId ? data.fields.find((x) => x.key === fieldId.slice(6)) : undefined;
    if (!f) return setToast({ text: t("fieldsManager.ctrlHelp") });
    if (f.kind === "form" || !f.inEvent) return setToast({ text: t("fieldsManager.ctrlNotPossible") });
    const use = otherId.startsWith("use:") ? otherId.slice(4) : otherId === "src:portal" ? "portal" : null;
    if (use && SURFACE_USES.has(use)) {
      const on = !f.uses.includes(use as never);
      return void patchField(f.key, { surface: { use, on } }, { surface: { use, on: !on } });
    }
    if (use === "form" && f.kind === "custom") return void patchField(f.key, { required: !f.required }, { required: f.required });
    if (use === "portal" && f.fromTemplate) {
      const next = f.portalAccess && f.portalAccess !== "hidden" ? "hidden" : "edit";
      return void patchField(f.key, { portalAccess: next }, { portalAccess: f.portalAccess ?? "hidden" });
    }
    setToast({ text: t("fieldsManager.ctrlNotPossible") });
  };
  const openTab = (x: string, extra: Record<string, string> = {}) => (OLD_TAB[x]?.[1] ? setParams({ tab: "tools", tool: OLD_TAB[x][1]!, ...extra }) : setParams({ tab: OLD_TAB[x]?.[0] ?? x, ...extra }));
  const ticketEvent = data.variables.some((v) => v.category === "order");

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-semibold text-ink">{t("fieldsManager.title")}</h1>
        <select
          value={data.eventId ?? ""}
          onChange={(e) => setParams({ event: e.target.value, key: null, node: null })}
          className="ml-auto rounded-lg border border-mist bg-paper px-2.5 py-1.5 text-[13px]"
          aria-label={t("fieldsManager.event")}
        >
          {data.events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>
      <p className="mb-3 text-[13px] text-ink-secondary">{t("fieldsManager.hint")}</p>

      <div className="mb-3 flex flex-wrap gap-2 text-[12px]">
        <span className="rounded-full border border-mist px-2.5 py-1">{t("fieldsManager.countFields", { n: String(data.fields.length) })}</span>
        <span className="rounded-full border border-dashed border-ember/60 px-2.5 py-1">{t("fieldsManager.countCalculated", { n: String(data.fields.filter((f) => f.calculated).length) })}</span>
        <span className="inline-flex items-center gap-1 rounded-full border border-mist px-2.5 py-1">
          <button type="button" aria-label="−" disabled={data.guardianSlots <= 1} onClick={() => setSlots(data.guardianSlots - 1)} className="px-1 disabled:opacity-30">−</button>
          {t("fieldsManager.countGuardianSlots", { n: String(data.guardianSlots) })}
          <button type="button" aria-label="+" disabled={data.guardianSlots >= 6} onClick={() => setSlots(data.guardianSlots + 1)} className="px-1 disabled:opacity-30">+</button>
        </span>
        <span className="rounded-full border border-mist px-2.5 py-1">{t("fieldsManager.countSources", { n: String(data.sources.length) })}</span>
      </div>

      <nav className="mb-4 flex gap-1 border-b border-mist">
        {TABS.map((x) => (
          <button key={x} type="button" onClick={() => setParams({ tab: x })} className={`-mb-px border-b-2 px-3 py-2 text-[13px] ${tab === x ? "border-ember font-medium text-ink" : "border-transparent text-ink-secondary hover:text-ink"}`}>
            {t(`fieldsManager.tab.${x}`)}
            {x === "tools" && !!data.reviewCount && <span className="ml-1 rounded-full bg-ember px-1.5 text-[11px] text-white">{data.reviewCount}</span>}
          </button>
        ))}
      </nav>
      {tab === "tools" && (
        <nav className="mb-3 flex flex-wrap gap-1">
          {TOOLS.map((x) => (
            <button key={x} type="button" onClick={() => setParams({ tool: x })} className={`rounded-full border px-3 py-1 text-[12px] ${tool === x ? "border-ember bg-paper-2 font-medium" : "border-mist"}`}>
              {t(`fieldsManager.tab.${x}`)}
              {x === "review" && !!data.reviewCount && <span className="ml-1 rounded-full bg-ember px-1.5 text-[11px] text-white">{data.reviewCount}</span>}
            </button>
          ))}
        </nav>
      )}

      {toast && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-pine bg-pine-bg px-3 py-2 text-[13px]">
          <span className="flex-1">{toast.text}</span>
          {toast.undo && <button type="button" onClick={toast.undo} className="rounded border border-pine px-2 py-0.5 text-[12px]">{t("fieldsManager.undo")}</button>}
          <button type="button" onClick={() => setToast(null)} aria-label="×" className="px-1">×</button>
        </div>
      )}
      {tab === "form" && data.eventId && <FormView key={data.eventId} eventId={data.eventId} overview={data} onChanged={refresh} />}
      {tab === "portal" &&
        (ticketEvent ? (
          <p className="rounded-xl border border-mist bg-paper p-4 text-[13px] text-ink-secondary">{t("fieldsManager.portalView.ticket")}</p>
        ) : (
          <div className="space-y-3 text-[13px]">
            <p className="text-ink-secondary">{t("fieldsManager.portalView.intro")}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <PortalLevels overview={data} onPatch={patchField} onChanged={refresh} />
            </div>
          </div>
        ))}
      {tab === "data" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setParams({ view: view === "diagram" ? null : "map" })} className={`rounded-full border px-3 py-1 text-[12px] ${view === "diagram" ? "border-ember bg-paper-2 font-medium" : "border-mist"}`}>
                {t(view === "diagram" ? "fieldsManager.view.list" : "fieldsManager.view.map")}
              </button>
              <span className="text-[12px] text-ink-secondary">{t("fieldsManager.ctrlHelp")}</span>
              <button type="button" onClick={() => setCreating(true)} className="ml-auto rounded-lg bg-ember px-3 py-1.5 text-[13px] text-white">+ {t("fieldsManager.newField")}</button>
            </div>
            {view === "diagram" ? (
              <FieldsOverview overview={data} docs={docs} selected={node} onSelect={selectNode} onConnect={connect} />
            ) : (
              <>
                <FieldsTable overview={data} selected={node} onSelect={selectNode} onPatch={patchField} onChanged={refresh} />
                <FieldsList overview={data} selected={node} onSelect={selectNode} onChanged={refresh} variablesOnly />
              </>
            )}
          </div>
          <div className="lg:sticky lg:top-4 lg:max-h-[92vh] lg:self-start lg:overflow-auto">
            <DetailPanel overview={data} docs={docs} selected={node} creating={creating} setCreating={setCreating} onSelect={selectNode} onChanged={refresh} onPatch={patchField} onOpenTab={openTab} />
          </div>
        </div>
      )}
      {tab === "tools" && tool === "cleanup" && <CleanupPanel overview={data} onChanged={refresh} />}
      {tab === "tools" && tool === "documents" && data.eventId && <DocumentEditor key={`${data.eventId}|${params.get("doc") ?? ""}`} eventId={data.eventId} docs={docs} initialDoc={params.get("doc")} />}
      {tab === "tools" && tool === "review" && data.eventId && <ReviewQueue key={data.eventId} eventId={data.eventId} onChanged={refresh} />}
      {tab === "tools" && tool === "import" && data.eventId && <ImportWizard key={data.eventId} eventId={data.eventId} />}
    </div>
  );
}
