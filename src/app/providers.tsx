"use client";
import { I18nProvider } from "@/lib/i18n";
import AppSidebar from "@/components/AppSidebar";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <div className="flex min-h-screen flex-col bg-paper text-ink md:flex-row">
        <AppSidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </I18nProvider>
  );
}
