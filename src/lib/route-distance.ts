// Cestovní příkazy: a km estimate between two typed places from OpenStreetMap -- Nominatim geocodes each name,
// OSRM drives it (up to 3 alternative routes) and the average distance is the suggestion. Only the place names
// leave the app. Free public services, so: one Nominatim call per second, results kept in memory.
// ponytail: in-memory cache + global 1 s spacing per instance; a shared cache / Google Routes API if volume grows.
const UA = "Tabornik/1.0 (+https://tabornik.online)";
const geoCache = new Map<string, { lat: string; lon: string; label: string } | null>();
const routeCache = new Map<string, { km: number; routes: number } | null>();
let nextGeoAt = 0;

async function nominatim(q: string) {
  const wait = nextGeoAt - Date.now();
  nextGeoAt = Math.max(Date.now(), nextGeoAt) + 1100;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=cs&countrycodes=cz,sk,at,de,pl&q=${encodeURIComponent(q)}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res?.ok) return undefined;
  const hit = ((await res.json().catch(() => [])) as { lat: string; lon: string; display_name: string }[])[0];
  return hit ? { lat: hit.lat, lon: hit.lon, label: hit.display_name } : null;
}

/** The place as typed (no guessing with a shortened name: a wrong place is worse than none). */
async function geocode(name: string) {
  const key = name.trim().toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key)!;
  const out = await nominatim(name);
  if (out !== undefined) geoCache.set(key, out);
  return out ?? null;
}

/** Average driving distance (km, 1 decimal) over the alternatives OSRM finds; null when a place isn't found. */
export async function mapDistance(from: string, to: string): Promise<{ km: number; routes: number; fromLabel: string; toLabel: string } | null> {
  const [a, b] = [await geocode(from), await geocode(to)];
  if (!a || !b) return null;
  const key = `${a.lat},${a.lon};${b.lat},${b.lon}`;
  if (!routeCache.has(key)) {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?alternatives=3&overview=false`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) }).catch(() => null);
    const j = res?.ok ? ((await res.json().catch(() => null)) as { code?: string; routes?: { distance: number }[] } | null) : null;
    const routes = j?.code === "Ok" ? j.routes ?? [] : [];
    const val = routes.length ? { km: Math.round(routes.reduce((s, r) => s + r.distance, 0) / routes.length / 100) / 10, routes: routes.length } : null;
    if (res?.ok) routeCache.set(key, val);
    if (!val) return null;
  }
  const r = routeCache.get(key);
  return r ? { ...r, fromLabel: a.label, toLabel: b.label } : null;
}
