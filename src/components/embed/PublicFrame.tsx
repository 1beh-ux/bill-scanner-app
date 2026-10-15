"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { gateHeaders } from "@/components/embed/embed-client";
import { publicFontVariables } from "@/components/embed/public-fonts";
import { appearanceCss, type Appearance } from "@/lib/public-appearance";

// Wraps every public page (/r, /p, landing). Embed mode (?embed=1, docs/custom-domain.md
// "Embedding"): no theme toggle / footer (useEmbed), transparent background, compact
// margins, the height posted to the embedding page, links leaving the page open in a new
// tab, links within the form / portal keep embed=1, portal downloads carry the gate header.
// ?theme=light|dark forces the theme; embedded without it the system's is used.
const EmbedContext = createContext(false);
export const useEmbed = () => useContext(EmbedContext);

// appearance: the organization's font / size / line height (src/lib/public-appearance.ts), embedded or not.
export default function PublicFrame({ embed, theme, appearance, children }: { embed: boolean; theme: "light" | "dark" | null; appearance?: Partial<Appearance> | null; children: React.ReactNode }) {
  const css = appearanceCss(appearance ?? null, ".pub");
  const ref = useRef<HTMLDivElement>(null);
  // Before first paint (the root layout's script only knows the stored choice).
  // ?theme= wins; then the organization's "Vzhled" choice (embedded: always; on its own page:
  // unless the visitor picked with the toggle); embedded without either: the system's.
  const orgTheme = appearance?.publicTheme === "light" || appearance?.publicTheme === "dark" ? appearance.publicTheme : null;
  const forced = theme ?? (embed ? orgTheme : null);
  const themeScript = forced
    ? `document.documentElement.classList.toggle("dark", ${forced === "dark"});`
    : orgTheme
      ? `try{if(!localStorage.getItem("theme"))document.documentElement.classList.toggle("dark", ${orgTheme === "dark"});}catch(e){}`
      : embed
        ? `document.documentElement.classList.toggle("dark", matchMedia("(prefers-color-scheme: dark)").matches);`
        : null;

  useEffect(() => {
    if (!embed || window.parent === window) return;
    const el = ref.current;
    if (!el) return;
    let last = 0;
    const post = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      if (height === last) return;
      last = height;
      window.parent.postMessage({ type: "tabornik:height", height }, "*");
    };
    post();
    const ro = new ResizeObserver(post);
    ro.observe(el);
    return () => ro.disconnect();
  }, [embed]);

  useEffect(() => {
    if (!embed) return;
    const onClick = async (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a || !a.href || e.defaultPrevented || a.target === "_blank") return;
      const url = new URL(a.href, location.href);
      if (url.origin === location.origin && url.pathname.startsWith("/api/portal/")) {
        // A portal file: the cookie isn't there inside a frame -- fetch with the gate header.
        const token = url.pathname.split("/")[3] ?? "";
        const headers = gateHeaders(token);
        if (!headers["x-portal-gate"]) return;
        e.preventDefault();
        const res = await fetch(url, { headers }).catch(() => null);
        if (!res?.ok) return;
        const name = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(res.headers.get("content-disposition") ?? "")?.[1];
        const blobUrl = URL.createObjectURL(await res.blob());
        const dl = document.createElement("a");
        dl.href = blobUrl;
        dl.download = name ? decodeURIComponent(name) : "dokument";
        dl.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        return;
      }
      if (url.origin === location.origin && (url.pathname.startsWith("/r/") || url.pathname.startsWith("/p/"))) {
        if (url.searchParams.get("embed") !== "1") {
          url.searchParams.set("embed", "1");
          if (theme) url.searchParams.set("theme", theme);
          a.href = url.toString();
        }
        return;
      }
      if (url.protocol === "http:" || url.protocol === "https:") {
        a.target = "_blank";
        a.rel = "noopener";
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [embed, theme]);

  return (
    <EmbedContext.Provider value={embed}>
      {themeScript && <script dangerouslySetInnerHTML={{ __html: themeScript }} />}
      {embed && <style>{"html,body{background:transparent!important}[data-embed] .pb-16{padding-bottom:1rem!important}"}</style>}
      {css && <style>{css}</style>}
      <div ref={ref} data-embed={embed ? "" : undefined} className="flow-root">
        <div className={`pub ${publicFontVariables}`}>{children}</div>
      </div>
    </EmbedContext.Provider>
  );
}

