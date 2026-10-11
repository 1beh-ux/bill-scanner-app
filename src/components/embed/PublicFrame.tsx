"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { gateHeaders } from "@/components/embed/embed-client";

// Wraps every public page (/r, /p, landing). Embed mode (?embed=1, docs/custom-domain.md
// "Embedding"): no theme toggle / footer (useEmbed), transparent background, compact
// margins, the height posted to the embedding page, links leaving the page open in a new
// tab, links within the form / portal keep embed=1, portal downloads carry the gate header.
// ?theme=light|dark forces the theme; embedded without it the system's is used.
const EmbedContext = createContext(false);
export const useEmbed = () => useContext(EmbedContext);

export default function PublicFrame({ embed, theme, children }: { embed: boolean; theme: "light" | "dark" | null; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Before first paint (the root layout's script only knows the stored choice).
  const themeScript = theme
    ? `document.documentElement.classList.toggle("dark", ${theme === "dark"});`
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
      <div ref={ref} data-embed={embed ? "" : undefined} className="flow-root">
        {children}
      </div>
    </EmbedContext.Provider>
  );
}

/** ?embed=1 / ?theme= from a page's searchParams. */
export function embedParams(sp: Record<string, string | string[] | undefined>): { embed: boolean; theme: "light" | "dark" | null } {
  const theme = sp.theme === "light" || sp.theme === "dark" ? sp.theme : null;
  return { embed: sp.embed === "1", theme };
}
