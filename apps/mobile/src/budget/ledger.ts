// The phone's own weekly ledger (D38): every silent action the phone signed, in US dollars, kept on the device. The
// guard counts the larger of this and the server's ledger, so a server that forgets a spend cannot stretch the week.
// The week is the ISO week from Monday 00:00 UTC, the same as the api's (apps/api/src/budget/service.ts weekStart).
// A row is released when its action ends without moving money (failed, canceled, expired), like the api does.
// Storage is injected (ledger-store.ts on the device), so this stays a plain module.

const MS_PER_DAY = 86_400_000;
const SUNDAY_OFFSET = 6;
const MONDAY = 1;
/** Rows kept per wallet and chain: far more than a week of silent actions, small enough for any store. */
const MAX_ROWS = 200;
const KEY_PREFIX = "kawase.budget.ledger.";
const NONE = 0n;

/** Monday 00:00 UTC of the week `at` falls in. */
export function weekStart(at: Date): Date {
  const day = at.getUTCDay();
  const back = day === 0 ? SUNDAY_OFFSET : day - MONDAY;
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()) - back * MS_PER_DAY);
}

export type PhoneLedgerRow = { intentId: string; category: string; venue: string; amountUsd: string; at: number; released?: boolean | undefined };

/** Where the rows live: a string per key (AsyncStorage on the device, a Map in tests). */
export type LedgerStore = { get: (key: string) => Promise<string | null | undefined>; set: (key: string, value: string) => Promise<void> };

const keyOf = (wallet: string, chainId: number) => `${KEY_PREFIX}${chainId}.${wallet.toLowerCase()}`;

function parse(raw: string | null | undefined): PhoneLedgerRow[] {
  if (!raw) return [];
  try {
    const rows = JSON.parse(raw) as unknown;
    return Array.isArray(rows) ? rows.filter((row): row is PhoneLedgerRow => typeof row === "object" && row !== null && typeof (row as PhoneLedgerRow).amountUsd === "string" && /^\d+$/.test((row as PhoneLedgerRow).amountUsd)) : [];
  } catch {
    return [];
  }
}

/** What this week's rows add up to, in US dollar base units. */
export function spentIn(rows: readonly PhoneLedgerRow[], now: Date): bigint {
  const from = weekStart(now).getTime();
  return rows.filter((row) => row.at >= from && !row.released).reduce((sum, row) => sum + BigInt(row.amountUsd), NONE);
}

export function createPhoneLedger(store: LedgerStore) {
  const read = async (wallet: string, chainId: number) => parse(await store.get(keyOf(wallet, chainId)).catch(() => undefined));
  const write = (wallet: string, chainId: number, rows: PhoneLedgerRow[]) => store.set(keyOf(wallet, chainId), JSON.stringify(rows.slice(-MAX_ROWS))).catch(() => undefined);
  return {
    /** This week's silent spend on this wallet and chain. */
    async spent(wallet: string, chainId: number, now = new Date()): Promise<bigint> {
      return spentIn(await read(wallet, chainId), now);
    },
    /** A silent action the phone just signed. Recording the same intent twice keeps one row. */
    async record(wallet: string, chainId: number, row: Omit<PhoneLedgerRow, "at" | "released"> & { at?: number | undefined }) {
      const rows = (await read(wallet, chainId)).filter((existing) => existing.intentId !== row.intentId);
      rows.push({ intentId: row.intentId, category: row.category, venue: row.venue.toLowerCase(), amountUsd: row.amountUsd, at: row.at ?? Date.now() });
      await write(wallet, chainId, rows);
    },
    /** The action ended without moving money: its room comes back. */
    async release(wallet: string, chainId: number, intentId: string) {
      const rows = await read(wallet, chainId);
      if (!rows.some((row) => row.intentId === intentId)) return;
      await write(wallet, chainId, rows.map((row) => (row.intentId === intentId ? { ...row, released: true } : row)));
    },
    rows: read,
  };
}

export type PhoneLedger = ReturnType<typeof createPhoneLedger>;
