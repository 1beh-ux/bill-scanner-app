"use client";

import { I18nProvider } from "@/lib/i18n";
import AppHeader from "@/components/AppHeader";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <AppHeader />
      {children}
    </I18nProvider>
  );
}
