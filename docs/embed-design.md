# Claude Code prompt 13 (final): embeddable registration form AND parent portal, appearance settings,
# clickjacking protection

Repo: bill-scanner-app, branch `embed` from master. Read CLAUDE.md, AGENTS.md, docs/custom-domain.md,
docs/organizations-change-notes.md, src/proxy.ts, src/lib/public-host.ts, src/lib/portal-gate.ts,
src/app/r/, src/app/p/, src/app/api/portal/, src/components/events/PublicRegistrationSettings.tsx
first. Small steps; after each: `npx prisma generate` (schema), `npx tsc --noEmit`, `npx eslint` on
changed files, commit. Czech UI, every new key in a seed script. Schema changes additive only. Save
this prompt as docs/embed-design.md.

## Goal
An organization can place its public registration form (/r/<slug>) and its parent portal (/p/<token>)
inside pages of its own website (WordPress, Joomla...) with an iframe, so parents never leave the
organization's site. Only websites the organization lists may frame these pages. Public pages get
organization-level font and size settings so they match the host website. Everything else in the app
becomes non-frameable.

## Part 1 – Framing headers (security)
- Admin hosts (tabornik.online, www, run.app): every response gets
  `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`.
- Public hosts: /r/* and /p/* HTML pages get `Content-Security-Policy: frame-ancestors 'self'
  <allowed origins>` and NO X-Frame-Options; allowed origins = PublicHost.embedOrigins of that host
  (empty -> 'none'). Landing page and everything else on public hosts -> 'none' + DENY.
- Implement where the host is known (proxy.ts with the existing 60 s cached host lookup is acceptable
  for this header, or another mechanism you justify). The header must be on the HTML responses.
- Keep the existing `Content-Security-Policy: sandbox` on document downloads.

## Part 2 – Allowed embedders and the portal page address
- PublicHost (additive): `embedOrigins String[] @default([])` — normalized origins `https://host[:port]`
  (no path, no wildcard, no http except localhost); `embedPageUrl String?` — only for portal hosts:
  the full https URL of the organization's web page that embeds the portal (e.g.
  https://www.zare.cz/rodicovsky-portal); its origin must be in embedOrigins.
- UI: APLIKACE -> Veřejné adresy (super-admin): per host "Weby, které smějí stránku vložit" (one
  origin per line; help: "Např. https://www.zare.cz. Jen tyto weby mohou stránku zobrazit v rámečku
  (iframe).") and, for portal hosts, "Stránka portálu na webu organizace" (help: "Když je vyplněno,
  odkazy do portálu v e-mailech vedou na tuto stránku."). Organization admins see both read-only in
  Organizace -> Připojení.

## Part 3 – Embed mode (form and portal)
- `?embed=1` on /r/<slug> and /p/<token> (and every page/step within them): no page header/footer/
  theme toggle, transparent page background, compact margins; the organization name stays in the
  form/portal heading. Links that leave the embedded page (help, terms, external) open with
  target="_blank" rel="noopener"; navigation within the form or portal keeps `embed=1`.
- `?theme=light|dark` forces the theme; default follows the system.
- Height: a ResizeObserver on the root posts `{ type: "tabornik:height", height }` to window.parent
  (targetOrigin "*" is fine, height is not sensitive) on load and every size change; after submit,
  validation errors and portal page changes also post `{ type: "tabornik:scrollTop" }`.
- Downloads inside the embedded portal (profile documents) must still work (test them).

## Part 4 – Portal gate inside an iframe
Browsers block or partition third-party cookies in iframes, so the birth-date gate can't rely on its
cookie when embedded.
- Keep the existing signed gate value (portal-gate.ts, PORTAL_SECRET) and its lifetime; accept it from
  the existing cookie OR from a request header `x-portal-gate`.
- In embed mode the portal client stores the gate value in sessionStorage (key per token) after a
  successful birth-date check and sends it as `x-portal-gate` on every portal API call; top-level
  (non-embedded) use keeps the cookie exactly as today.
- Server checks are unchanged otherwise (rate limiting, token, organization/host checks).

## Part 5 – Portal links in e-mails
- If the organization's active default portal host has embedPageUrl, every portal link the app
  generates (publicUrl / portalUrl, e-mails, documents, the portal-link resend) becomes
  `<embedPageUrl>#t=<token>`. The token goes after `#`, never in the query string, so it never reaches
  the website's server or its logs. Otherwise links stay `https://<portal host>/p/<token>`.
- Direct links already sent (`https://rodice.kasicka.eu/p/<token>`) keep working top-level.

## Part 6 – Appearance of public pages (organization level)
- First, inspect https://www.zare.cz (curl the HTML and its stylesheets): find the font families used
  for body text and headings, the base font size and the heading sizes. Report them in the summary.
- Organization (additive): `publicFontFamily String?`, `publicHeadingFontFamily String?`,
  `publicBaseFontSize Int?` (px), `publicHeadingScale String?` (compact | normal | large),
  `publicLineHeight String?` (compact | normal | relaxed). Null = today's look.
- Curated font list, self-hosted via next/font (NO runtime requests to fonts.googleapis.com or
  any third party): Výchozí (IBM Plex Sans, today's), Systémové písmo, Open Sans, Roboto, Lato,
  Montserrat, Source Sans 3, Noto Sans, Nunito, Poppins, Raleway, Ubuntu, Merriweather (serif),
  PT Serif (serif) — PLUS every family found on zare.cz in the first step, if it's available as a
  Google font; if zare.cz uses a non-Google/commercial font, add the closest Google font labelled
  "Podobné jako na zare.cz (<font name>)" and say so in the summary. Base size options: 14, 15, 16, 17,
  18 px plus the value found on zare.cz if different. Only the chosen font files are downloaded by the
  browser (declare all, load used).
- Apply the settings only to public pages (/r/*, /p/*, landing), embedded or not; the admin app is
  unchanged.
- UI: Organizace -> new page "Vzhled veřejných stránek" (organization admin): selects for body font,
  heading font, base size, heading scale, line height, with a live preview of a sample form section
  and a portal card; "Obnovit výchozí". Super-admin sees it for the acting organization.

## Part 7 – "Vložit na web" snippets
- In the event's public registration settings: button "Vložit na web" -> dialog with a copyable
  snippet (host/slug filled in via publicUrl):
  <iframe id="tabornik-prihlaska" src="https://<host>/r/<slug>?embed=1" title="Přihláška"
    style="width:100%;border:0;min-height:700px" loading="lazy"></iframe>
  <script>
  window.addEventListener("message", function (e) {
    if (e.origin !== "https://<host>") return;
    var f = document.getElementById("tabornik-prihlaska");
    if (!f || !e.data) return;
    if (e.data.type === "tabornik:height") f.style.height = e.data.height + "px";
    if (e.data.type === "tabornik:scrollTop") f.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  </script>
- In Organizace -> Připojení (portal host row): "Vložit portál na web" -> snippet that reads the token
  from the page URL fragment, removes it from the address bar, and builds the iframe:
  <div id="tabornik-portal"></div>
  <script>
  (function () {
    var host = "https://<portal host>";
    var m = location.hash.match(/(?:^#|&)t=([A-Za-z0-9_-]+)/);
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
  </script>
  (Adjust the token regex to the real token format. The landing page in embed mode says, in Czech, to
  open the portal through the link from the e-mail.)
- Both dialogs: warning if embedOrigins is empty ("Stránku zatím nesmí vložit žádný web – požádejte
  administrátora aplikace o přidání adresy vašeho webu."); short instructions: WordPress -> blok
  „Vlastní HTML“; Joomla -> modul „Vlastní“ nebo článek s editorem „Žádný“, v Globální konfiguraci ->
  Filtry textu povolit iframe a script pro vaši skupinu; a "Náhled" link (?embed=1 in a new tab).

## Part 8 – Checks, deploy
1. scripts/embed-check.sh (curl): tabornik.online/login -> frame-ancestors 'none' + DENY; prihlasky
   /r/<slug> with empty embedOrigins -> 'none'; after adding https://www.zare.cz and
   https://zare.cz to both hosts and setting rodice's embedPageUrl to https://www.zare.cz/rodicovsky-portal
   (one-off script, dry-run/--apply) -> frame-ancestors 'self' https://www.zare.cz https://zare.cz, no
   X-Frame-Options, on /r/<slug> and /p/<token>; rodice landing -> 'none'; a generated portal link
   uses the #t= form; no request to fonts.googleapis.com/gstatic in the public HTML.
2. Portal gate test: portal API call with a valid x-portal-gate header and no cookie -> OK; without
   either -> gate required; a forged header -> rejected.
3. tsc, eslint, `npm run build`, check-org-scope (0 unexplained), test-org-isolation --run (extend: an
   organization admin can't change embedOrigins/embedPageUrl; organization A's appearance settings
   don't affect organization B's public pages). Any fail -> STOP.
4. Push `embed`, fast-forward master, push. Note the serving revision. Deploy with the full
   ~/deploy-registration.sh flow (no --async). Run embed-check.sh against production. Admin app broken
   -> roll back, report.
5. Summary: zare.cz fonts/sizes found and how they map to the options, files, migration, check results,
   anything contradicting this prompt. Add "Embedding" and "Appearance" sections to docs/custom-domain.md.
