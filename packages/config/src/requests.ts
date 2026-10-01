import { SECONDS_PER_DAY, MS_PER_SECOND } from "./units";

/** A payment request link stays payable this long. */
export const REQUEST_TTL_S = 30 * SECONDS_PER_DAY;
/** Random bytes in a request link's token (base64url); unguessable, short enough to read aloud. */
export const REQUEST_TOKEN_BYTES = 12;
export const REQUEST_NOTE_MAX = 140;

/** The incoming-transfer watcher: how often it reads the chain, and how much it reads at once. */
export const WATCH_INTERVAL_MS = 10 * MS_PER_SECOND;
/** Public RPCs cap `eth_getLogs` at 10,000 blocks (context/01-arc/gotchas.md #25); stay well under. */
export const WATCH_MAX_BLOCKS = 2_000n;
/** On a first run, look back this far so a payment made just before the watcher started is still seen. */
export const WATCH_BACKFILL_BLOCKS = 600n;
/** The head block can lag on load-balanced RPCs (gotcha #26): read up to latest minus this. */
export const WATCH_HEAD_LAG_BLOCKS = 1n;
/** Wallets per `to` filter in one `eth_getLogs` call. */
export const WATCH_ADDRESS_CHUNK = 100;
