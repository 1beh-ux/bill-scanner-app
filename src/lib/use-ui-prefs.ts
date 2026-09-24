"use client";

import { useCallback, useEffect, useState } from "react";
import { UI_PREF_DEFAULTS, type UiPrefs } from "@/lib/ui-prefs";

/** Reads User.uiPrefs (defaults until /api/me answers); `save` merges a patch server-side. */
export function useUiPrefs() {
  const [prefs, setPrefs] = useState<Required<UiPrefs>>(UI_PREF_DEFAULTS);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me: { uiPrefs?: UiPrefs } | null) => me?.uiPrefs && setPrefs((p) => ({ ...p, ...me.uiPrefs })));
  }, []);

  const save = useCallback((patch: UiPrefs) => {
    setPrefs((p) => ({ ...p, ...patch }));
    fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uiPrefs: patch }) });
  }, []);

  return { prefs, setLocal: (patch: UiPrefs) => setPrefs((p) => ({ ...p, ...patch })), save };
}
