"use client";

import { useState } from "react";

// "Vložit na web" (docs/custom-domain.md "Embedding"): the snippet an organization pastes
// into its own website -- the registration form of one event, or the parent portal.
type T = (key: string, vars?: Record<string, string>) => string;

export function formSnippet(host: string, slug: string): string {
  return `<iframe id="tabornik-prihlaska" src="${host}/r/${slug}?embed=1" title="Přihláška"
  style="width:100%;border:0;min-height:700px" loading="lazy"></iframe>
<script>
window.addEventListener("message", function (e) {
  if (e.origin !== "${host}") return;
  var f = document.getElementById("tabornik-prihlaska");
  if (!f || !e.data) return;
  if (e.data.type === "tabornik:height") f.style.height = e.data.height + "px";
  if (e.data.type === "tabornik:scrollTop") f.scrollIntoView({ behavior: "smooth", block: "start" });
});
</script>`;
}

// Portal tokens are base64url (src/lib/portal-gate.ts newPortalToken). The token arrives after "#"
// (never sent to the website's server), is kept in sessionStorage and removed from the address bar.
export function portalSnippet(host: string): string {
  return `<div id="tabornik-portal"></div>
<script>
(function () {
  var host = "${host}";
  var m = location.hash.match(/(?:^#|&)t=([A-Za-z0-9_-]{32,})/);
  var box = document.getElementById("tabornik-portal");
  if (!box) return;
  if (m) {
    try { sessionStorage.setItem("tabornik-portal-token", m[1]); } catch (e) {}
    history.replaceState(null, "", location.pathname + location.search);
  }
  var t = m ? m[1] : (function () { try { return sessionStorage.getItem("tabornik-portal-token"); } catch (e) { return null; } })();
  var f = document.createElement("iframe");
  f.id = "tabornik-portal-frame"; f.title = "Rodičovský portál";
  f.style.cssText = "width:100%;border:0;min-height:700px";
  f.src = t ? host + "/p/" + t + "?embed=1" : host + "/?embed=1";
  box.appendChild(f);
  window.addEventListener("message", function (e) {
    if (e.origin !== host || !e.data) return;
    if (e.data.type === "tabornik:height") f.style.height = e.data.height + "px";
    if (e.data.type === "tabornik:scrollTop") f.scrollIntoView({ behavior: "smooth", block: "start" });
  });
})();
</script>`;
}

export default function EmbedSnippetDialog({ title, snippet, previewUrl, origins, onClose, t }: { title: string; snippet: string; previewUrl: string; origins: string[]; onClose: () => void; t: T }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="scrollbar-app flex max-h-[90vh] w-full max-w-2xl flex-col gap-3 overflow-y-auto rounded-lg bg-paper p-5 shadow-lg">
        <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
        {origins.length === 0 ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{t("embed.noOrigins")}</p>
        ) : (
          <p className="text-[13px] text-ink-secondary">{t("embed.allowedOrigins", { origins: origins.join(", ") })}</p>
        )}
        <pre className="overflow-x-auto rounded bg-paper-2 p-3 text-[11.5px] text-ink">{snippet}</pre>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover"
            onClick={() => navigator.clipboard?.writeText(snippet).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {})}
          >
            {copied ? t("connections.copied") : t("connections.copy")}
          </button>
          <a href={previewUrl} target="_blank" rel="noopener" className="text-[13px] text-ember hover:underline">{t("embed.preview")}</a>
        </div>
        <div className="text-[13px] text-ink-secondary">
          <p className="font-medium text-ink">{t("embed.howTitle")}</p>
          <p>{t("embed.howWordpress")}</p>
          <p>{t("embed.howJoomla")}</p>
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="text-[14px] text-ink-secondary hover:underline">{t("common.close")}</button>
        </div>
      </div>
    </div>
  );
}
