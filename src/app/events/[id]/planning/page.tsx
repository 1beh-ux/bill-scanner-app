"use client";

import { use } from "react";
import PlanningBoard from "@/components/planning/PlanningBoard";

// Planning Helper board -- see docs/planning-helper-module-design.md.
export default function PlanningPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <PlanningBoard eventId={id} />;
}
