"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { useTranslations } from "@/lib/i18n";

/**
 * Small "?" link to a Nápověda topic (/napoveda#slug). Already on /napoveda,
 * it sets the hash natively instead: Next's client navigation doesn't fire
 * `hashchange`, which is what the help page listens to.
 */
export default function HelpLink({ slug, className = "" }: { slug: string; className?: string }) {
  const { t } = useTranslations();
  const pathname = usePathname();
  return (
    <Link
      href={`/napoveda#${slug}`}
      onClick={(e) => {
        if (pathname !== "/napoveda") return;
        e.preventDefault();
        window.location.hash = slug;
      }}
      title={t("help.link")}
      aria-label={t("help.link")}
      className={"inline-flex items-center opacity-70 hover:opacity-100 " + className}
    >
      <CircleHelp size={13} aria-hidden="true" />
    </Link>
  );
}
