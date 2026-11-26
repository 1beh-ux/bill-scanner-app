"use client";

import { useEffect, useState } from "react";
import FieldInput from "@/components/registration/FieldInput";
import type { GuardianFieldDef } from "@/lib/guardian-fields";

// The organization's own guardian fields (2026-11-26, src/lib/guardian-fields.ts) as inputs under a guardian's
// fixed ones -- the admin screens (Lidé, participant detail) and the portal.
export function useGuardianFields(): GuardianFieldDef[] {
  const [fields, setFields] = useState<GuardianFieldDef[]>([]);
  useEffect(() => {
    fetch("/api/guardian-fields")
      .then((r) => (r.ok ? r.json() : { fields: [] }))
      .then((d) => setFields(d.fields ?? []))
      .catch(() => setFields([]));
  }, []);
  return fields;
}

export default function GuardianExtraInputs({ fields, value, onChange, yesLabel, compact }: { fields: GuardianFieldDef[]; value: Record<string, string> | undefined; onChange: (v: Record<string, string>) => void; yesLabel: string; compact?: boolean }) {
  if (!fields.length) return null;
  return (
    <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
      {fields.map((f) => (
        <label key={f.key} className={`flex flex-col gap-1 ${compact ? "text-[12px]" : "text-[13px]"} text-ink-secondary`}>
          <span>
            {f.label}
            {f.required && " *"}
          </span>
          <FieldInput field={f} value={value?.[f.key] ?? ""} onChange={(v) => onChange({ ...(value ?? {}), [f.key]: v })} yesLabel={yesLabel} />
        </label>
      ))}
    </div>
  );
}
