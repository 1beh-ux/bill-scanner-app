"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { publicFontVariables } from "@/components/embed/public-fonts";
import { appearanceCss, BASE_SIZES, HEADING_SCALES, LINE_HEIGHTS, MAX_WIDTH, MIN_WIDTH, PUBLIC_FONTS, THEMES, type Appearance } from "@/lib/public-appearance";

// Organizace -> Vzhled veřejných stránek (docs/custom-domain.md "Appearance"): font, sizes and
// line height of the registration form, the parent portal and the landing page -- embedded in
// the organization's website or not. The admin app itself is unchanged. Live preview below.
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
const inputClass = "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

export default function AppearancePage() {
  const { t, role, isSuperAdmin, roleLoaded } = useTranslations();
  const [a, setA] = useState<Appearance | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/organizations/appearance")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setA(d ?? EMPTY))
      .catch(() => setA(EMPTY));
  }, []);

  async function save(next: Appearance) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/organizations/appearance", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => null);
    setBusy(false);
    if (res?.ok) setA(await res.json());
    setMessage(t(res?.ok ? "appearance.saved" : "appearance.failed"));
  }

  if (roleLoaded && role !== "admin" && !isSuperAdmin) return <div className="p-8 text-[14px] text-ink-secondary">{t("appearance.adminOnly")}</div>;
  if (!a) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;

  const set = (patch: Partial<Appearance>) => setA({ ...a, ...patch });
  const fontSelect = (value: string | null, onChange: (v: string | null) => void, label: string) => (
    <label className="text-[13px] text-ink-secondary">
      {label}
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className={inputClass + " mt-1"}>
        <option value="">{t("appearance.default")}</option>
        {PUBLIC_FONTS.map((f) => (
          <option key={f.key} value={f.key}>{f.label}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <h1 className="mb-1 text-[22px] font-semibold text-ink">{t("appearance.title")}</h1>
      <p className="mb-5 text-[14px] text-ink-secondary">{t("appearance.subtitle")}</p>
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex w-full max-w-sm flex-col gap-3">
          {fontSelect(a.publicFontFamily, (v) => set({ publicFontFamily: v }), t("appearance.bodyFont"))}
          {fontSelect(a.publicHeadingFontFamily, (v) => set({ publicHeadingFontFamily: v }), t("appearance.headingFont"))}
          <label className="text-[13px] text-ink-secondary">
            {t("appearance.baseSize")}
            <select value={a.publicBaseFontSize ?? ""} onChange={(e) => set({ publicBaseFontSize: e.target.value ? Number(e.target.value) : null })} className={inputClass + " mt-1"}>
              <option value="">{t("appearance.default")}</option>
              {BASE_SIZES.map((n) => (
                <option key={n} value={n}>{n} px{n === 16 ? ` (${t("appearance.likeZare")})` : ""}</option>
              ))}
            </select>
          </label>
          <label className="text-[13px] text-ink-secondary">
            {t("appearance.headingScale")}
            <select value={a.publicHeadingScale ?? ""} onChange={(e) => set({ publicHeadingScale: e.target.value || null })} className={inputClass + " mt-1"}>
              <option value="">{t("appearance.default")}</option>
              {HEADING_SCALES.map((k) => (
                <option key={k} value={k}>{t(`appearance.scale.${k}`)}</option>
              ))}
            </select>
          </label>
          <label className="text-[13px] text-ink-secondary">
            {t("appearance.lineHeight")}
            <select value={a.publicLineHeight ?? ""} onChange={(e) => set({ publicLineHeight: e.target.value || null })} className={inputClass + " mt-1"}>
              <option value="">{t("appearance.default")}</option>
              {LINE_HEIGHTS.map((k) => (
                <option key={k} value={k}>{t(`appearance.line.${k}`)}</option>
              ))}
            </select>
          </label>
          <label className="text-[13px] text-ink-secondary">
            {t("appearance.theme")}
            <select value={a.publicTheme ?? ""} onChange={(e) => set({ publicTheme: e.target.value || null })} className={inputClass + " mt-1"}>
              <option value="">{t("appearance.themeSystem")}</option>
              {THEMES.map((k) => (
                <option key={k} value={k}>{t(`appearance.theme.${k}`)}</option>
              ))}
            </select>
            <span className="mt-1 block text-[11.5px]">{t("appearance.themeHint")}</span>
          </label>
          <label className="flex items-start gap-2 text-[13px] text-ink">
            <input type="checkbox" checked={a.publicTransparent} onChange={(e) => set({ publicTransparent: e.target.checked })} className="mt-0.5 h-4 w-4 accent-ember" />
            <span>
              {t("appearance.transparent")}
              <span className="block text-[11.5px] text-ink-secondary">{t("appearance.transparentHint")}</span>
            </span>
          </label>
          <div className="text-[13px] text-ink-secondary">
            {t("appearance.width")}
            <div className="mt-1 flex gap-2">
              <select
                value={a.publicContentWidth === null ? "" : a.publicContentWidth === 0 ? "full" : "px"}
                onChange={(e) => set({ publicContentWidth: e.target.value === "" ? null : e.target.value === "full" ? 0 : (a.publicContentWidth || 900) })}
                className={inputClass}
              >
                <option value="">{t("appearance.widthDefault")}</option>
                <option value="full">{t("appearance.widthFull")}</option>
                <option value="px">{t("appearance.widthPx")}</option>
              </select>
              {!!a.publicContentWidth && (
                <input type="number" min={MIN_WIDTH} max={MAX_WIDTH} step={10} value={a.publicContentWidth} onChange={(e) => set({ publicContentWidth: Number(e.target.value) || MIN_WIDTH })} className={inputClass + " w-28"} aria-label="px" />
              )}
            </div>
            <span className="mt-1 block text-[11.5px]">{t("appearance.widthHint", { min: String(MIN_WIDTH), max: String(MAX_WIDTH) })}</span>
          </div>
          {message && <p className="text-[13px] text-ink">{message}</p>}
          <div className="flex justify-between gap-3">
            <button type="button" disabled={busy} onClick={() => save(EMPTY)} className="text-[14px] text-ink-secondary hover:underline disabled:opacity-50">{t("appearance.reset")}</button>
            <button type="button" disabled={busy} onClick={() => save(a)} className={btnPrimary}>{t("common.save")}</button>
          </div>
        </div>

        {/* Preview: the public pages' own markup style, with the settings above. */}
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-[12px] uppercase tracking-wide text-ink-secondary">{t("appearance.preview")}</p>
          <style>{appearanceCss(a, ".pub-preview", false)}</style>
          {/* The chosen theme is shown in the preview; transparent = the checkered backdrop shows through. */}
          <div className={a.publicTheme === "dark" ? "dark" : ""} style={a.publicTransparent ? { backgroundImage: "repeating-conic-gradient(#e4e1da 0% 25%, transparent 0% 50%)", backgroundSize: "16px 16px" } : undefined}>
          <div className={`pub-preview ${publicFontVariables} flex flex-col gap-4 rounded-lg border border-mist ${a.publicTransparent ? "" : "bg-paper"} p-4`}>
            <div>
              <p className="text-[14px] font-semibold text-ink">{t("appearance.sampleOrg")}</p>
              <h1 className="text-[22px] font-semibold text-ink">{t("appearance.sampleEvent")}</h1>
              <p className="text-[14px] text-ink-secondary">{t("appearance.sampleText")}</p>
            </div>
            <section className="flex flex-col gap-2 rounded-lg border border-mist bg-paper-2 p-4">
              <h2 className="text-[16px] font-semibold text-ink">{t("appearance.sampleSection")}</h2>
              <label className="text-[13px] text-ink-secondary">
                {t("appearance.sampleField")}
                <input readOnly value="Jana Nováková" className={inputClass + " mt-1"} />
              </label>
              <button type="button" className={btnPrimary + " self-start"}>{t("appearance.sampleButton")}</button>
            </section>
            <section className="flex flex-col gap-1 rounded-lg border border-mist bg-paper-2 p-4">
              <h3 className="text-[16px] font-semibold text-ink">{t("appearance.sampleCard")}</h3>
              <p className="text-[13px] text-ink-secondary">1. 7. – 14. 7. 2027 · Jedlová</p>
              <p className="text-[14px] text-ink">{t("appearance.sampleCardText")}</p>
            </section>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
