"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { publicFontVariables } from "@/components/embed/public-fonts";
import {
  appearanceCss,
  BASE_SIZES,
  HEADING_SCALES,
  layered,
  LINE_HEIGHTS,
  MAX_WIDTH,
  MIN_WIDTH,
  PUBLIC_FONTS,
  THEMES,
  type Appearance,
  type AppearanceLayer,
} from "@/lib/public-appearance";

// Vzhled veřejných stránek (docs/custom-domain.md "Appearance"): font, sizes, theme, background and
// width of the public pages -- the admin app itself is unchanged. Live preview beside.
// Organizace -> Vzhled: three tabs -- the parent portal (the base), "Vložené na web" (?embed=1 pages)
// and the standalone Veřejná přihláška page, the last two as layers whose fields may follow the portal.
// Nastavení akce -> Veřejná přihláška (eventId): that event's own layer over the organization's.
const EMPTY: Appearance = {
  publicFontFamily: null,
  publicHeadingFontFamily: null,
  publicBaseFontSize: null,
  publicHeadingScale: null,
  publicLineHeight: null,
  publicTheme: null,
  publicTransparent: false,
  publicContentWidth: null,
};
type OrgView = { base: Appearance; embed: AppearanceLayer; registration: AppearanceLayer };
type Tab = "base" | "embed" | "registration";
const INHERIT = "__inherit";
const inputClass = "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const tabClass = (on: boolean) => "rounded-full px-3 py-1 text-[13px] " + (on ? "bg-ember text-white" : "bg-paper-2 text-ink hover:bg-mist");

// tickets (R4-7, audit2): a ticket-sale event's sample reads like a ticket order, not a camp registration.
export default function AppearanceEditor({ eventId, tickets = false }: { eventId?: string; tickets?: boolean }) {
  const { t, role, isSuperAdmin, roleLoaded } = useTranslations();
  const [org, setOrg] = useState<OrgView | null>(null);
  const [ev, setEv] = useState<{ inherited: Partial<Appearance>; layer: AppearanceLayer } | null>(null);
  const [tab, setTab] = useState<Tab>("base");
  // What's being edited: the full base set, or a layer (keys present = own value).
  const [base, setBase] = useState<Appearance>(EMPTY);
  const [layer, setLayer] = useState<AppearanceLayer>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const url = eventId ? `/api/events/${eventId}/appearance` : "/api/organizations/appearance";

  function take(d: OrgView | { inherited: Partial<Appearance>; layer: AppearanceLayer }, which: Tab) {
    if ("base" in d) {
      setOrg(d);
      setBase(d.base);
      setLayer(which === "base" ? {} : d[which]);
    } else {
      setEv(d);
      setLayer(d.layer);
    }
  }
  useEffect(() => {
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && take(d, "base"))
      .catch(() => {});
  }, [url]);

  async function save(values: object) {
    setBusy(true);
    setMessage(null);
    const body = eventId ? { values } : { layer: tab, values };
    const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (res?.ok) take(await res.json(), tab);
    setMessage(t(res?.ok ? "appearance.saved" : "appearance.failed"));
  }

  if (!eventId && roleLoaded && role !== "admin" && !isSuperAdmin) return <div className="p-8 text-[14px] text-ink-secondary">{t("appearance.adminOnly")}</div>;
  if (!org && !ev) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;

  const isLayer = !!eventId || tab !== "base";
  // The look underneath the layer being edited (the portal's for the org layers, the organization's for an event).
  const under: Partial<Appearance> = eventId ? ev!.inherited : org!.base;
  const shown: Partial<Appearance> = isLayer ? layered(under, layer) : base;
  const inheritLabel = t(eventId ? "appearance.inheritOrg" : "appearance.inheritPortal");

  // One field: its select value ("__inherit" = follow underneath, "" = the default value) and setter.
  const get = <K extends keyof Appearance>(k: K): Appearance[K] | typeof INHERIT => (isLayer ? (k in layer ? (layer[k] as Appearance[K]) : INHERIT) : base[k]);
  const put = <K extends keyof Appearance>(k: K, v: Appearance[K] | typeof INHERIT) => {
    if (!isLayer) return setBase({ ...base, [k]: v });
    const next = { ...layer };
    if (v === INHERIT) delete next[k];
    else (next as Record<string, unknown>)[k] = v;
    setLayer(next);
  };
  const enc = (v: unknown) => (v === INHERIT ? INHERIT : v === null || v === undefined ? "" : String(v));
  const select = (k: keyof Appearance, label: string, options: { value: string; label: string }[], defaultLabel: string, parse: (s: string) => unknown = (s) => s, hint?: string) => (
    <label className="text-[13px] text-ink-secondary">
      {label}
      <select value={enc(get(k))} onChange={(e) => put(k, (e.target.value === INHERIT ? INHERIT : e.target.value === "" ? null : parse(e.target.value)) as never)} className={inputClass + " mt-1"}>
        {isLayer && <option value={INHERIT}>{inheritLabel}</option>}
        <option value="">{defaultLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint && <span className="mt-1 block text-[11.5px]">{hint}</span>}
    </label>
  );
  const fonts = PUBLIC_FONTS.map((f) => ({ value: f.key, label: f.label }));
  const width = get("publicContentWidth");
  const widthMode = width === INHERIT ? INHERIT : width === null ? "" : width === 0 ? "full" : "px";
  const transparent = get("publicTransparent");

  return (
    <div className={eventId ? "" : "mx-auto max-w-5xl p-4 md:p-8"}>
      {eventId ? (
        <h2 className="mb-1 text-[16px] font-semibold text-ink">{t("appearance.eventTitle")}</h2>
      ) : (
        <h1 className="mb-1 text-[22px] font-semibold text-ink">{t("appearance.title")}</h1>
      )}
      <p className="mb-4 text-[14px] text-ink-secondary">{t(eventId ? "appearance.eventSubtitle" : "appearance.subtitle")}</p>
      {!eventId && (
        <>
          <div className="mb-2 flex flex-wrap gap-2">
            {(["base", "embed", "registration"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setTab(k);
                  setMessage(null);
                  setBase(org!.base);
                  setLayer(k === "base" ? {} : org![k]);
                }}
                className={tabClass(tab === k)}
              >
                {t(`appearance.tab.${k}`)}
              </button>
            ))}
          </div>
          <p className="mb-5 text-[12.5px] text-ink-secondary">{t(`appearance.tabHint.${tab}`)}</p>
        </>
      )}
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex w-full max-w-sm flex-col gap-3">
          {select("publicFontFamily", t("appearance.bodyFont"), fonts, t("appearance.default"))}
          {select("publicHeadingFontFamily", t("appearance.headingFont"), fonts, t("appearance.default"))}
          {select(
            "publicBaseFontSize",
            t("appearance.baseSize"),
            BASE_SIZES.map((n) => ({ value: String(n), label: `${n} px${n === 16 ? ` (${t("appearance.likeZare")})` : ""}` })),
            t("appearance.default"),
            Number
          )}
          {select("publicHeadingScale", t("appearance.headingScale"), HEADING_SCALES.map((k) => ({ value: k, label: t(`appearance.scale.${k}`) })), t("appearance.default"))}
          {select("publicLineHeight", t("appearance.lineHeight"), LINE_HEIGHTS.map((k) => ({ value: k, label: t(`appearance.line.${k}`) })), t("appearance.default"))}
          {select("publicTheme", t("appearance.theme"), THEMES.map((k) => ({ value: k, label: t(`appearance.theme.${k}`) })), t("appearance.themeSystem"), (s) => s, t("appearance.themeHint"))}
          {isLayer ? (
            <label className="text-[13px] text-ink-secondary">
              {t("appearance.transparent")}
              <select value={transparent === INHERIT ? INHERIT : transparent ? "on" : "off"} onChange={(e) => put("publicTransparent", e.target.value === INHERIT ? INHERIT : e.target.value === "on")} className={inputClass + " mt-1"}>
                <option value={INHERIT}>{inheritLabel}</option>
                <option value="off">{t("appearance.withBackground")}</option>
                <option value="on">{t("appearance.transparent")}</option>
              </select>
              <span className="mt-1 block text-[11.5px]">{t("appearance.transparentHint")}</span>
            </label>
          ) : (
            <label className="flex items-start gap-2 text-[13px] text-ink">
              <input type="checkbox" checked={base.publicTransparent} onChange={(e) => put("publicTransparent", e.target.checked)} className="mt-0.5 h-4 w-4 accent-ember" />
              <span>
                {t("appearance.transparent")}
                <span className="block text-[11.5px] text-ink-secondary">{t("appearance.transparentHint")}</span>
              </span>
            </label>
          )}
          <div className="text-[13px] text-ink-secondary">
            {t("appearance.width")}
            <div className="mt-1 flex gap-2">
              <select
                value={widthMode}
                onChange={(e) => put("publicContentWidth", e.target.value === INHERIT ? INHERIT : e.target.value === "" ? null : e.target.value === "full" ? 0 : typeof width === "number" && width > 0 ? width : 900)}
                className={inputClass}
              >
                {isLayer && <option value={INHERIT}>{inheritLabel}</option>}
                <option value="">{t("appearance.widthDefault")}</option>
                <option value="full">{t("appearance.widthFull")}</option>
                <option value="px">{t("appearance.widthPx")}</option>
              </select>
              {typeof width === "number" && width > 0 && (
                <input type="number" min={MIN_WIDTH} max={MAX_WIDTH} step={10} value={width} onChange={(e) => put("publicContentWidth", Number(e.target.value) || MIN_WIDTH)} className={inputClass + " w-28"} aria-label="px" />
              )}
            </div>
            <span className="mt-1 block text-[11.5px]">{t("appearance.widthHint", { min: String(MIN_WIDTH), max: String(MAX_WIDTH) })}</span>
          </div>
          {message && <p className="text-[13px] text-ink">{message}</p>}
          <div className="flex justify-between gap-3">
            <button type="button" disabled={busy} onClick={() => save(isLayer ? {} : EMPTY)} className="text-[14px] text-ink-secondary hover:underline disabled:opacity-50">
              {t(isLayer ? "appearance.resetLayer" : "appearance.reset")}
            </button>
            <button type="button" disabled={busy} onClick={() => save(isLayer ? layer : base)} className={btnPrimary}>{t("common.save")}</button>
          </div>
        </div>

        {/* Preview: the public pages' own markup style, with the resulting look. */}
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-[12px] uppercase tracking-wide text-ink-secondary">{t("appearance.preview")}</p>
          <style>{appearanceCss(shown, ".pub-preview", false)}</style>
          {/* The chosen theme is shown in the preview; transparent = the checkered backdrop shows through. */}
          <div className={shown.publicTheme === "dark" ? "dark" : ""} style={shown.publicTransparent ? { backgroundImage: "repeating-conic-gradient(#e4e1da 0% 25%, transparent 0% 50%)", backgroundSize: "16px 16px" } : undefined}>
            <div className={`pub-preview ${publicFontVariables} flex flex-col gap-4 rounded-lg border border-mist ${shown.publicTransparent ? "" : "bg-paper"} p-4`}>
              <div>
                <p className="text-[14px] font-semibold text-ink">{t("appearance.sampleOrg")}</p>
                <h1 className="text-[22px] font-semibold text-ink">{t(tickets ? "appearance.tickets.sampleEvent" : "appearance.sampleEvent")}</h1>
                <p className="text-[14px] text-ink-secondary">{t(tickets ? "appearance.tickets.sampleText" : "appearance.sampleText")}</p>
              </div>
              <section className="flex flex-col gap-2 rounded-lg border border-mist bg-paper-2 p-4">
                <h2 className="text-[16px] font-semibold text-ink">{t(tickets ? "appearance.tickets.sampleSection" : "appearance.sampleSection")}</h2>
                <label className="text-[13px] text-ink-secondary">
                  {t("appearance.sampleField")}
                  <input readOnly value="Jana Nováková" className={inputClass + " mt-1"} />
                </label>
                <button type="button" className={btnPrimary + " self-start"}>{t(tickets ? "appearance.tickets.sampleButton" : "appearance.sampleButton")}</button>
              </section>
              <section className="flex flex-col gap-1 rounded-lg border border-mist bg-paper-2 p-4">
                <h3 className="text-[16px] font-semibold text-ink">{t(tickets ? "appearance.tickets.sampleCard" : "appearance.sampleCard")}</h3>
                <p className="text-[13px] text-ink-secondary">1. 7. – 14. 7. 2027 · Jedlová</p>
                <p className="text-[14px] text-ink">{t(tickets ? "appearance.tickets.sampleCardText" : "appearance.sampleCardText")}</p>
              </section>
            </div>
          </div>
          {shown.publicTransparent && shown.publicTheme === "dark" && <p className="mt-2 text-[12px] text-amber-700">{t("appearance.darkTransparentWarn")}</p>}
        </div>
      </div>
    </div>
  );
}
