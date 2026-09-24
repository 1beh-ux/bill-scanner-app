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
          {/* Desktop: main is the scroll container (full height), so position:sticky
              inside pages sticks while scrolling -- with overflow-x set and no
              height, main was a scroll container that never scrolled, and every
              sticky element in it stayed put. Print gets normal flow back. */}
          <main className="min-w-0 flex-1 overflow-x-auto md:h-screen md:overflow-y-auto print:h-auto print:overflow-visible">{children}</main>
        </div>
      </ConfirmProvider>
    </I18nProvider>
  );
}
