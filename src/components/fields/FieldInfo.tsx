"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "@/lib/i18n";
import FieldCard from "./FieldCard";
import type { FmDocTemplate, FmOverview } from "./types";

// "ⓘ" next to a field's name anywhere in the app (Fields Manager phase 2b): the field card in a popover.
// Renders nothing unless the viewer is an admin of an organization with the "fields_manager" flag.
// One overview + one template check per event and page load, shared by every ⓘ on the page.
const cache = new Map<string, { overview: Promise<FmOverview | null>; docs: Promise<FmDocTemplate[]> }>();
function load(eventId: string) {
  let hit = cache.get(eventId);
  if (!hit) {
    const q = `?event=${encodeURIComponent(eventId)}`;
    hit = {
      overview: fetch(`/api/fields/overview${q}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      docs: fetch(`/api/fields/documents${q}`).then((r) => (r.ok ? r.json() : { templates: [] })).then((x) => x.templates).catch(() => []),
    };
    cache.set(eventId, hit);
  }
  return hit;
}

export default function FieldInfo({ eventId, fieldKey }: { eventId: string; fieldKey: string }) {
  const { t, role, features } = useTranslations();
  const [open, setOpen] = useState(false);
  const [overview, setOverview] = useState<FmOverview | null | undefined>(undefined);
  const [docs, setDocs] = useState<FmDocTemplate[] | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const l = load(eventId);
    l.overview.then(setOverview);
    l.docs.then(setDocs);
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open, eventId]);

  if (role !== "admin" || !features.includes("fields_manager")) return null;
  const field = overview?.fields.find((f) => f.key === fieldKey);

  return (
    <span ref={ref} className="relative ml-1 inline-block align-middle" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={t("fieldsManager.fieldDetails")} aria-expanded={open} className="rounded-full px-1 text-[11px] text-ink-secondary hover:bg-paper-2 hover:text-ink">
        ⓘ
      </button>
      {open && (
        <div role="dialog" className="absolute left-0 top-full z-50 mt-1 w-80 text-left font-normal normal-case tracking-normal shadow-lg">
          {overview === undefined ? (
            <div className="rounded-xl border border-mist bg-paper p-3 text-[12px] text-ink-secondary">{t("fieldsManager.loading")}</div>
          ) : field && overview ? (
            <>
              <FieldCard field={field} overview={overview} docs={docs} />
              <Link href={`/fields?tab=list&event=${encodeURIComponent(eventId)}&key=${encodeURIComponent(fieldKey)}`} className="block rounded-b-xl bg-paper-2 px-4 py-1.5 text-[12px] text-ink hover:underline">
                {t("fieldsManager.openInManager")}
              </Link>
            </>
          ) : (
            <div className="rounded-xl border border-mist bg-paper p-3 text-[12px] text-ink-secondary">{t("fieldsManager.loadFailed")}</div>
          )}
        </div>
      )}
    </span>
  );
}
