// N2/N3 (audit2): a module's pages render only for someone with that module's grant on the event; otherwise the
// shared denial -- also when the page is opened by its URL. Used by the module folders' layout.tsx files.
import type { ReactNode } from "react";
import type { ModuleKey } from "@/generated/prisma";
import { getCurrentUser } from "@/lib/auth";
import { hasModuleAccess } from "@/lib/module-access";
import NoAccess from "@/components/NoAccess";

export async function ModulePageGuard({ eventId, modules, children }: { eventId: string; modules: ModuleKey[]; children: ReactNode }) {
  const user = await getCurrentUser();
  // Not signed in: the proxy sends the browser to /login before this renders.
  if (!user) return children;
  for (const m of modules) if (await hasModuleAccess(user, eventId, m)) return children;
  return <NoAccess />;
}
