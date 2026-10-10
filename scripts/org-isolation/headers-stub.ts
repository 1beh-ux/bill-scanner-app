// Test stand-in for next/headers outside a Next request (scripts/test-org-isolation.ts):
// cookies come from globalThis.__orgTestCookies (e.g. acting_org), the host is the admin host.
const jar = () => (globalThis as { __orgTestCookies?: Record<string, string> }).__orgTestCookies ?? {};

export async function cookies() {
  return {
    get: (name: string) => (name in jar() ? { name, value: jar()[name] } : undefined),
    getAll: () => Object.entries(jar()).map(([name, value]) => ({ name, value })),
    has: (name: string) => name in jar(),
  };
}

export async function headers() {
  return new Headers({ host: "tabornik.online" });
}
