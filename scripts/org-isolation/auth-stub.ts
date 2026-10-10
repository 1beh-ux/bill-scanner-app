// Test stand-in for src/lib/auth.ts (scripts/test-org-isolation.ts only, via
// tsconfig.org-isolation.json paths): the "signed-in" user is whoever the test sets.
import type { User } from "@/generated/prisma";

export async function getCurrentUser(): Promise<User | null> {
  return (globalThis as { __orgTestUser?: User | null }).__orgTestUser ?? null;
}
