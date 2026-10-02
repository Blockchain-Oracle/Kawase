import { MS_PER_SECOND } from "./units";

export const QUOTE_CACHE_TTL_MS = 15 * MS_PER_SECOND;
/** The public aggregate counts (`GET /public/stats`) are recomputed at most this often. */
export const PUBLIC_STATS_CACHE_MS = 60 * MS_PER_SECOND;
