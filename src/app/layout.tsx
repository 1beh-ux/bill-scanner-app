import type { Metadata } from "next";
import "./globals.css";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { headers } from "next/headers";
import { Providers } from "./providers";
import { isAdminHost, requestHost } from "@/lib/host-rules";
import { isStaging } from "@/lib/app-env";

// Self-hosted at build time (next/font): no request to fonts.googleapis.com / gstatic at runtime --
// the public pages run inside other organizations' websites (docs/custom-domain.md "Appearance").
const plexSans = IBM_Plex_Sans({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], variable: "--font-plex-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin", "latin-ext"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

// Staging (docs/staging/plan.md): every tab title says so.
const titlePrefix = isStaging() ? "[STAGING] " : "";

export const metadata: Metadata = {
  title: { default: `${titlePrefix}tabornik.online`, template: `${titlePrefix}%s · tabornik.online` },
  applicationName: "tabornik.online",
  appleWebApp: { title: "tabornik.online" },
  description: "Pomocník pro pořádání táborů a akcí: účtenky, účastníci, zdraví, pošta, plánování",
};

// Runs before React hydrates, so the correct theme class is already on <html>
// by first paint — no flash of the wrong theme. suppressHydrationWarning on
// <html> below is required because of this: server-rendered HTML never has
// the class, only the client does after this script runs, and that's expected.
const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem("theme");
    if (stored === "dark") document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs" suppressHydrationWarning className={`${plexSans.variable} ${plexMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {isStaging() && (
          <div
            role="status"
            style={{ background: "#b45309", color: "#fff", font: "600 13px/1.6 system-ui, sans-serif", textAlign: "center", padding: "2px 8px", letterSpacing: "0.02em" }}
          >
            STAGING — testovací prostředí, smyšlená data · test environment, invented data
          </div>
        )}
        {/* A public address (prihlasky.<org>.cz…) serves only the form / portal: never the app shell. Its "/" is
            a rewrite, so the browser path can't tell -- the host can. */}
        <Providers publicHost={!isAdminHost(requestHost(await headers()))}>{children}</Providers>
      </body>
    </html>
  );
}
