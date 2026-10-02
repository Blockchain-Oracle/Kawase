// Approximate device location (cards/access.md "Devices: … approximate location"): the city and country of the IP a
// request came from, from DB-IP's free API (no key; for small sites, 500 lookups a day), cached per IP for a day. Only
// the coarse place is kept on the device row; the IP is never stored. Private and local addresses have no place.
import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";

import { MS_PER_SECOND, SECONDS_PER_DAY } from "@kawase/config";

const LOOKUP_URL = "https://api.db-ip.com/v2/free/";
const LOOKUP_TIMEOUT_MS = 3_000;
const CACHE_MS = SECONDS_PER_DAY * MS_PER_SECOND;
const CACHE_MAX = 5_000;
const PRIVATE = /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|fc|fd|fe80:|::ffff:(10\.|127\.|192\.168\.))/i;

const cache = new Map<string, { at: number; place: string | null }>();

/** The caller's address: the first hop Traefik recorded, else the socket's (not in tests). */
export function clientIp(c: Context): string | undefined {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}

/** "Lisbon, Portugal", or null when unknown. Never throws. */
export async function approximatePlace(ip: string | undefined, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!ip || PRIVATE.test(ip)) return null;
  const hit = cache.get(ip);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.place;
  let place: string | null = null;
  try {
    const response = await fetchImpl(`${LOOKUP_URL}${encodeURIComponent(ip)}`, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
    if (response.ok) {
      const data = (await response.json()) as { city?: string; countryName?: string; error?: string };
      place = [data.city, data.countryName].filter(Boolean).join(", ") || null;
    }
  } catch {
    place = null;
  }
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(ip, { at: Date.now(), place });
  return place;
}
