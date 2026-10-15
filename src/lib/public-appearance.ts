// Look of the public pages (/r, /p, landing; docs/custom-domain.md "Appearance"), per
// organization. Pure + client-safe: the options, validation and the CSS for a wrapper
// (.pub). Fonts are self-hosted (src/components/embed/public-fonts.ts); null = today's look.

// key -> label + CSS family. "var(--pf-…)" is a next/font variable set on the wrapper.
export const PUBLIC_FONTS: { key: string; label: string; family: string }[] = [
  { key: "system", label: "Systémové písmo", family: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif' },
  { key: "open-sans", label: "Open Sans", family: "var(--pf-open-sans), sans-serif" },
  { key: "roboto", label: "Roboto", family: "var(--pf-roboto), sans-serif" },
  { key: "lato", label: "Lato", family: "var(--pf-lato), sans-serif" },
  { key: "montserrat", label: "Montserrat", family: "var(--pf-montserrat), sans-serif" },
  { key: "source-sans-3", label: "Source Sans 3", family: "var(--pf-source-sans-3), sans-serif" },
  { key: "noto-sans", label: "Noto Sans", family: "var(--pf-noto-sans), sans-serif" },
  { key: "nunito", label: "Nunito", family: "var(--pf-nunito), sans-serif" },
  { key: "poppins", label: "Poppins", family: "var(--pf-poppins), sans-serif" },
  { key: "raleway", label: "Raleway", family: "var(--pf-raleway), sans-serif" },
  { key: "ubuntu", label: "Ubuntu", family: "var(--pf-ubuntu), sans-serif" },
  { key: "merriweather", label: "Merriweather (patkové)", family: "var(--pf-merriweather), Georgia, serif" },
  { key: "pt-serif", label: "PT Serif (patkové)", family: "var(--pf-pt-serif), Georgia, serif" },
  // zare.cz: body = the system stack above (Bootstrap 5); headings + menu = Trebuchet MS
  // (Microsoft, not a Google font) -> the closest Google one, plus the real one where installed.
  { key: "zare-trebuchet", label: "Podobné jako na zare.cz (Trebuchet MS)", family: '"Trebuchet MS", var(--pf-fira-sans), sans-serif' },
];
export const BASE_SIZES = [14, 15, 16, 17, 18];
export const HEADING_SCALES = ["compact", "normal", "large"] as const;
export const LINE_HEIGHTS = ["compact", "normal", "relaxed"] as const;
export const THEMES = ["light", "dark"] as const;
// Content width: 0 = 100 % (the whole frame / window), else px.
export const MIN_WIDTH = 320;
export const MAX_WIDTH = 2400;

export type Appearance = {
  publicFontFamily: string | null;
  publicHeadingFontFamily: string | null;
  publicBaseFontSize: number | null;
  publicHeadingScale: string | null;
  publicLineHeight: string | null;
  // light | dark | null = the visitor's system (embedded) / their own choice (not embedded).
  publicTheme: string | null;
  // No page / card background: the embedding website's shows through.
  publicTransparent: boolean;
  publicContentWidth: number | null;
};

const fontOk = (v: unknown) => v === null || PUBLIC_FONTS.some((f) => f.key === v);

/** A PATCH body -> clean values ("" / null = default), or null when something isn't an option. */
export function cleanAppearance(b: Record<string, unknown>): Appearance | null {
  const n = (v: unknown) => (v === "" || v === undefined ? null : v);
  const a = {
    publicFontFamily: n(b.publicFontFamily),
    publicHeadingFontFamily: n(b.publicHeadingFontFamily),
    publicBaseFontSize: n(b.publicBaseFontSize) === null ? null : Number(b.publicBaseFontSize),
    publicHeadingScale: n(b.publicHeadingScale),
    publicLineHeight: n(b.publicLineHeight),
    publicTheme: n(b.publicTheme),
    publicTransparent: b.publicTransparent === true,
    publicContentWidth: n(b.publicContentWidth) === null ? null : Number(b.publicContentWidth),
  };
  if (!fontOk(a.publicFontFamily) || !fontOk(a.publicHeadingFontFamily)) return null;
  if (a.publicBaseFontSize !== null && !BASE_SIZES.includes(a.publicBaseFontSize)) return null;
  if (a.publicHeadingScale !== null && !(HEADING_SCALES as readonly unknown[]).includes(a.publicHeadingScale)) return null;
  if (a.publicLineHeight !== null && !(LINE_HEIGHTS as readonly unknown[]).includes(a.publicLineHeight)) return null;
  if (a.publicTheme !== null && !(THEMES as readonly unknown[]).includes(a.publicTheme)) return null;
  const w = a.publicContentWidth;
  if (w !== null && !(Number.isInteger(w) && (w === 0 || (w >= MIN_WIDTH && w <= MAX_WIDTH)))) return null;
  return a as Appearance;
}

// Public pages are drawn at 14 px body text: a bigger base scales the page (zoom) from there.
const TODAY_BASE = 14;
const HEADING_ZOOM: Record<string, number> = { compact: 0.9, normal: 1, large: 1.2 };
const LINE: Record<string, number> = { compact: 1.3, normal: 1.5, relaxed: 1.75 };
const family = (key: string | null) => PUBLIC_FONTS.find((f) => f.key === key)?.family ?? null;

/** CSS for `${scope}` (the wrapper selector); "" = today's look. page = false: no html/body rules (the admin preview). */
export function appearanceCss(a: Partial<Appearance> | null, scope: string, page = true): string {
  if (!a) return "";
  const rules: string[] = [];
  const body = family(a.publicFontFamily ?? null);
  const heading = family(a.publicHeadingFontFamily ?? null) ?? body;
  const own: string[] = [];
  if (body) own.push(`font-family:${body}`);
  if (a.publicBaseFontSize && a.publicBaseFontSize !== TODAY_BASE) own.push(`zoom:${(a.publicBaseFontSize / TODAY_BASE).toFixed(4)}`);
  if (a.publicLineHeight && LINE[a.publicLineHeight]) own.push(`line-height:${LINE[a.publicLineHeight]}`);
  if (own.length) rules.push(`${scope}{${own.join(";")}}`);
  // Form controls don't inherit the font by default.
  if (body) rules.push(`${scope} input,${scope} select,${scope} textarea,${scope} button{font-family:inherit}`);
  const h: string[] = [];
  if (heading) h.push(`font-family:${heading}`);
  if (a.publicHeadingScale && HEADING_ZOOM[a.publicHeadingScale] && a.publicHeadingScale !== "normal") h.push(`zoom:${HEADING_ZOOM[a.publicHeadingScale]}`);
  if (h.length) rules.push(`${scope} h1,${scope} h2,${scope} h3{${h.join(";")}}`);
  // Content width of the form / portal column (.pub-container): 0 = 100 %.
  if (typeof a.publicContentWidth === "number") rules.push(`${scope} .pub-container{max-width:${a.publicContentWidth === 0 ? "none" : `${a.publicContentWidth}px`}}`);
  // No background: page and cards transparent (form fields keep theirs, so they stay visible).
  if (a.publicTransparent) {
    if (page) rules.push("html,body{background:transparent!important}");
    rules.push(`${scope} :is(.bg-paper,.bg-paper-2):not(input,select,textarea){background-color:transparent!important}`);
  }
  // A sanity bound: only our own values reach this string, never free text.
  return rules.join("\n").replace(/[<>]/g, "");
}
