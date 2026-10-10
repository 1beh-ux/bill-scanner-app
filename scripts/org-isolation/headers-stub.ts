// Test stand-in for next/headers outside a Next request (scripts/test-org-isolation.ts):
// no cookies (so no acting_org), and the admin host.
export async function cookies() {
  return { get: (name: string) => (name ? undefined : undefined), getAll: () => [], has: () => false };
}

export async function headers() {
  return new Headers({ host: "tabornik.online" });
}
