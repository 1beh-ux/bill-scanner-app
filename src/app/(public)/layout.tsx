import type { Metadata } from "next";

// /r, /p and the public landing are shown on other organisations' domains
// (docs/custom-domain.md): never the app's name in the title -- not even on a
// 404 (not-found.tsx here), which can't set metadata of its own.
export const metadata: Metadata = {
  title: { absolute: "Přihlášky a rodičovský portál", template: "%s" },
  applicationName: null,
  appleWebApp: null,
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return children;
}
