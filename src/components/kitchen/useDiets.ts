"use client";

import { useEffect, useState } from "react";
import { DEFAULT_DIETS, type DietDef } from "@/lib/kitchen/allergens";

// The organization's diets (GET /api/kitchen/diets), loaded once per page view; the defaults until then.
let cache: Promise<DietDef[]> | null = null;
export const reloadDiets = () => {
  cache = null;
};

export function useDiets() {
  const [diets, setDiets] = useState<DietDef[]>(DEFAULT_DIETS);
  useEffect(() => {
    cache ??= fetch("/api/kitchen/diets")
      .then((r) => (r.ok ? r.json() : DEFAULT_DIETS))
      .catch(() => DEFAULT_DIETS);
    cache.then(setDiets);
  }, []);
  // A code the list no longer has (a deleted diet) still shows, as its code.
  const name = (code: string) => diets.find((d) => d.code === code)?.name ?? code;
  return { diets, name };
}
