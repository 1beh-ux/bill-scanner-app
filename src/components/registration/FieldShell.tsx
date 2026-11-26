"use client";

import type { ReactNode } from "react";
import { cleanFieldValue } from "@/lib/registration-fields";
import { choiceAnswer } from "@/lib/participant-fields";

// One question of a form for parents (2026-11-26): its label marked required (*) or optional ("nepovinné"), the hint,
// and -- on the field itself -- what is wrong: a value of the wrong format at once, an empty required answer after the
// first attempt to send. Public form, portal (registration step, details after acceptance, profile), the /u link.
export type FieldProblem = "invalid" | "missing" | null;

/** What is wrong with one answer. `showMissing`: after the first attempt to send. */
export function fieldProblem(f: { fieldType: string; options: unknown; required?: boolean }, value: string | undefined, showMissing: boolean): FieldProblem {
  if (f.fieldType === "calculated") return null;
  // An untouched prefilled Ano/Ne box counts as ticked.
  const v = choiceAnswer(f, value);
  if (v && cleanFieldValue(f, v) === null) return "invalid";
  const required = f.required !== false;
  if (required && showMissing && (f.fieldType === "consent" ? v !== "true" : f.fieldType === "boolean" ? false : !v)) return "missing";
  return null;
}

export type ShellTexts = { optional: string; invalid: string; missing: string };

export default function FieldShell({
  label,
  required,
  hint,
  problem,
  texts,
  extra,
  className = "",
  children,
}: {
  label: ReactNode;
  required: boolean;
  hint?: string | null;
  problem: FieldProblem;
  texts: ShellTexts;
  extra?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 text-[13px] text-ink-secondary ${problem ? "rounded-lg border border-red-400 bg-red-500/5 p-2" : ""} ${className}`}>
      <span>
        {label}
        {required ? <span className="text-ember"> *</span> : <span className="ml-1 text-[11.5px] italic">({texts.optional})</span>}
        {extra}
      </span>
      {hint && <span className="text-[12px]">{hint}</span>}
      {children}
      {problem && (
        <span role="alert" className="text-[12.5px] font-medium text-red-700">
          {problem === "invalid" ? texts.invalid : texts.missing}
        </span>
      )}
    </label>
  );
}
