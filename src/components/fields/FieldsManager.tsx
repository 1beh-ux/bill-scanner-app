"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import FieldsOverview from "./FieldsOverview";
import FieldsList from "./FieldsList";
import UsageMatrix from "./UsageMatrix";
import FieldCard from "./FieldCard";
import ImportWizard from "./ImportWizard";
import ReviewQueue from "./ReviewQueue";
import DocumentEditor from "./DocumentEditor";
import CleanupPanel from "./CleanupPanel";
import type { FmDocTemplate, FmOverview } from "./types";

// Organizace -> Pole (Fields Manager, phase 2: read-only). Tab, event and selection live in the URL
// (?tab=&event=&key=) so links and the back button work. Behind the organization flag "fields_manager".
const TABS = ["overview", "list", "usage", "documents", "import", "review", "cleanup"] as const;
type Tab = (typeof TABS)[number];

export default function FieldsManager() {
  const { t, role, roleLoaded, features } = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "overview";
  const eventParam = params.get("event");
  const key = params.get("key");

  const [data, setData] = useState<FmOverview | null>(null);
  const [failed, setFailed] = useState(false);
  const [docs, setDocs] = useState<FmDocTemplate[] | null>(null);
  const [reload, setReload] = useState(0);
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
  const selectedField = key ? data.fields.find((f) => f.key === key) ?? null : null;
  const selectNode = (id: string | null) => setParams({ key: id?.startsWith("field:") ? id.slice(6) : null, node: id });
  const node = params.get("node") ?? (key ? `field:${key}` : null);

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
            {x === "review" && !!data.reviewCount && <span className="ml-1 rounded-full bg-ember px-1.5 text-[11px] text-white">{data.reviewCount}</span>}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <FieldsOverview overview={data} docs={docs} selected={node} onSelect={selectNode} />
          <div className="lg:sticky lg:top-4 lg:self-start">
            {selectedField ? (
              <FieldCard field={selectedField} overview={data} docs={docs} />
            ) : (
              <p className="rounded-xl border border-mist bg-paper p-4 text-[13px] text-ink-secondary">{t("fieldsManager.overviewHelp")}</p>
            )}
          </div>
        </div>
      )}
      {tab === "list" && <FieldsList overview={data} docs={docs} selectedKey={key} onSelectKey={(k) => setParams({ key: k, node: `field:${k}` })} onShowInGraph={(k) => setParams({ tab: "overview", key: k, node: `field:${k}` })} onChanged={refresh} />}
      {tab === "cleanup" && <CleanupPanel overview={data} onChanged={refresh} />}
      {tab === "documents" && data.eventId && <DocumentEditor key={data.eventId} eventId={data.eventId} docs={docs} />}
      {tab === "review" && data.eventId && <ReviewQueue key={data.eventId} eventId={data.eventId} onChanged={refresh} />}
      {tab === "import" && data.eventId && <ImportWizard key={data.eventId} eventId={data.eventId} guardianSlots={data.guardianSlots} />}
      {tab === "usage" && <UsageMatrix overview={data} docs={docs} onSelectKey={(k) => setParams({ tab: "list", key: k, node: `field:${k}` })} />}
    </div>
  );
}
