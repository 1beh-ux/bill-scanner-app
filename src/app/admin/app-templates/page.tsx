"use client";

import { useTranslations } from "@/lib/i18n";
import { TemplateLevelProvider } from "@/lib/template-level";
import TemplatesEditor from "@/components/TemplatesEditor";

// Aplikace -> Šablony aplikace (super-admin): the app-level templates (organization NULL) that new
// organizations get as copies and organizations can restore from / load new ones from.
export default function AppTemplatesPage() {
  const { t, isSuperAdmin, roleLoaded } = useTranslations();
  if (roleLoaded && !isSuperAdmin) return <div className="p-8 text-[14px] text-ink-secondary">{t("orgs.superAdminOnly")}</div>;
  return (
    <TemplateLevelProvider value="app">
      <TemplatesEditor titleKey="nav.appTemplates" introKey="appTemplates.intro" />
    </TemplateLevelProvider>
  );
}
