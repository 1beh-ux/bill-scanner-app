"use client";

import { Suspense } from "react";
import FieldsManager from "@/components/fields/FieldsManager";

// Organizace -> Pole (Fields Manager, docs/fields-manager-design/). Suspense: the manager reads the URL's query
// (useSearchParams), which must sit under a Suspense boundary (Next docs, use-search-params).
export default function FieldsPage() {
  return (
    <Suspense fallback={null}>
      <FieldsManager />
    </Suspense>
  );
}
