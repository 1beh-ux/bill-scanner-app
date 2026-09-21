"use client";
import { I18nProvider } from "@/lib/i18n";
import AppSidebar from "@/components/AppSidebar";
import { ConfirmProvider } from "@/components/ConfirmDialog";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ConfirmProvider>
        <div className="flex min-h-screen flex-col bg-paper text-ink md:flex-row">
          <AppSidebar />
          <main className="min-w-0 flex-1 overflow-x-auto">{children}</main>
        </div>
      </ConfirmProvider>
    </I18nProvider>
  );
}
