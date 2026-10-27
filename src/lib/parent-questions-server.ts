import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";

/** "Dotazy na rodiče" routes: whoever sees the event's participants (Účastníci, Zdraví or Pošta). */
export async function questionsGuard(eventId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const denied = await requireAnyModuleAccess(user, eventId, ["participants", "health", "mail"]);
  return denied ? { error: denied } : { user };
}
