"use client";

import { useEffect } from "react";
import { useParams, usePathname } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import { routePattern } from "@/lib/activity-route";

// Usage metrics (/vyuziti): one beacon per page a signed-in user opens -- the route pattern
// (ids replaced by the route's own param names) and the event, never the raw path.
export default function ActivityTracker() {
  const pathname = usePathname();
  const params = useParams();
  const { role } = useTranslations();
  useEffect(() => {
    if (!role || !pathname) return;
    const eventId = pathname.startsWith("/events/") && typeof params?.id === "string" ? params.id : null;
    try {
      navigator.sendBeacon("/api/activity", JSON.stringify({ path: routePattern(pathname, params ?? {}), eventId }));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per page, not per params object identity
  }, [pathname, role]);
  return null;
}
