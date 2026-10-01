"use client";

import { useCallback, useEffect, useState } from "react";
import { UI_PREF_DEFAULTS, type UiPrefs } from "@/lib/ui-prefs";

const PREFS_EVENT = "ui-prefs-changed";

/** Reads User.uiPrefs (defaults until /api/me answers); `save` merges a patch server-side. */
export function useUiPrefs() {
  const [prefs, setPrefs] = useState<Required<UiPrefs>>(UI_PREF_DEFAULTS);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me: { uiPrefs?: UiPrefs } | null) => me?.uiPrefs && setPrefs((p) => ({ ...p, ...me.uiPrefs })));
    // Other hook instances (e.g. the sidebar while settings change favourites) follow along.
    const onChange = (e: Event) => setPrefs((p) => ({ ...p, ...(e as CustomEvent<UiPrefs>).detail }));
    window.addEventListener(PREFS_EVENT, onChange);
    return () => window.removeEventListener(PREFS_EVENT, onChange);
  }, []);

  const save = useCallback((patch: UiPrefs) => {
    window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: patch }));
    fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uiPrefs: patch }) });
  }, []);

  return { prefs, setLocal: (patch: UiPrefs) => setPrefs((p) => ({ ...p, ...patch })), save };
}
