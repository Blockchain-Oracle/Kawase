// The daily allowance, one per token (cards/automate-safety.md, X3): each is its own signed grant with an on-chain
// period cap for that token. What Kawase may spend from one today is the chain's room (the enforcer's own counter),
// never more than the person's tighter cap when they lowered it (tightening is instant, X7). A temporary raise is an
// extra grant for the same token that ends by itself; a payment goes under whichever single grant has room for all of
// it (a transfer is one redeem), so the most that can ever leave in a day is exactly the two caps the person sees.
import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { Address } from "viem";

import { grants, type Db } from "@kawase/db";
import { allowanceAvailable } from "@kawase/integrations-delegation";
import type { NetworkContext, NetworkId } from "@kawase/networks";

import type { NetworkClients } from "../wallet/chain";

type GrantRow = typeof grants.$inferSelect;
type Executor = Pick<Db, "select">;

const ZERO = 0n;

export type AllowanceGrant = {
  id: string;
  token: Address;
  delegation: Record<string, unknown>;
  /** What the signed grant allows per period. */
  signed: bigint;
  /** What Kawase holds itself to per period (≤ signed). */
  cap: bigint;
  periodSeconds: number;
  boost: boolean;
  expiresAt: Date;
  receipt: Record<string, unknown>;
};

export const tokenOfGrant = (row: Pick<GrantRow, "tokenAddress" | "receipt">) =>
  (row.tokenAddress ?? (row.receipt as { token?: string }).token ?? "").toLowerCase();

function toAllowance(row: GrantRow): AllowanceGrant {
  const cap = row.policyCap !== null && row.policyCap < row.periodAmount ? row.policyCap : row.periodAmount;
  return {
    id: row.id,
    token: tokenOfGrant(row) as Address,
    delegation: row.delegation,
    signed: row.periodAmount,
    cap,
    periodSeconds: row.periodSeconds,
    boost: row.boost,
    expiresAt: row.expiresAt,
    receipt: row.receipt,
  };
}

/** Every allowance grant that is on and not expired on one network, newest first. */
export async function liveAllowanceGrants(db: Executor, userId: string, network: NetworkId): Promise<AllowanceGrant[]> {
  const rows = await db
    .select()
    .from(grants)
    .where(and(eq(grants.userId, userId), eq(grants.network, network), eq(grants.kind, "allowance"), eq(grants.status, "active"), gt(grants.expiresAt, new Date())))
    .orderBy(desc(grants.createdAt));
  return rows.map(toAllowance);
}

/** One token's allowance: its everyday grant and an active raise, if any (the newest of each). */
export type TokenAllowance = { base: AllowanceGrant | undefined; boost: AllowanceGrant | undefined };

export function byToken(list: AllowanceGrant[]): Map<string, TokenAllowance> {
  const out = new Map<string, TokenAllowance>();
  for (const grant of list) {
    const entry = out.get(grant.token) ?? { base: undefined, boost: undefined };
    if (grant.boost) entry.boost ??= grant;
    else entry.base ??= grant;
    out.set(grant.token, entry);
  }
  return out;
}

export async function tokenAllowance(db: Executor, userId: string, network: NetworkId, token: Address): Promise<TokenAllowance> {
  const list = await liveAllowanceGrants(db, userId, network);
  return byToken(list).get(token.toLowerCase()) ?? { base: undefined, boost: undefined };
}

/**
 * What one grant can still move today: the enforcer's room, less what the person's own cap takes off. A failed read is
 * not room: it says nothing is left, so the payment asks for Face ID instead of trusting a guess.
 */
export async function grantRoom(client: NetworkClients["client"], network: NetworkContext, grant: AllowanceGrant): Promise<bigint> {
  const read = await allowanceAvailable(client, network, grant.delegation as never).catch(() => undefined);
  if (!read) return ZERO;
  const used = grant.signed > read.available ? grant.signed - read.available : ZERO;
  const capRoom = grant.cap > used ? grant.cap - used : ZERO;
  return capRoom < read.available ? capRoom : read.available;
}

export type AllowanceRoom = {
  active: boolean;
  /** The most one payment can be inside the allowance right now (the larger single room). */
  available: bigint;
  /** Today's total the person sees: the everyday cap plus an active raise. */
  perPeriod: bigint;
  base: { grant: AllowanceGrant; room: bigint } | undefined;
  boost: { grant: AllowanceGrant; room: bigint } | undefined;
};

export async function allowanceRoom(clients: Pick<NetworkClients, "client" | "network">, allowance: TokenAllowance): Promise<AllowanceRoom> {
  const [baseRoom, boostRoom] = await Promise.all([
    allowance.base ? grantRoom(clients.client, clients.network, allowance.base) : Promise.resolve(ZERO),
    allowance.boost ? grantRoom(clients.client, clients.network, allowance.boost) : Promise.resolve(ZERO),
  ]);
  return {
    active: Boolean(allowance.base ?? allowance.boost),
    available: baseRoom > boostRoom ? baseRoom : boostRoom,
    perPeriod: (allowance.base?.cap ?? ZERO) + (allowance.boost?.cap ?? ZERO),
    base: allowance.base ? { grant: allowance.base, room: baseRoom } : undefined,
    boost: allowance.boost ? { grant: allowance.boost, room: boostRoom } : undefined,
  };
}

/** The grant one payment of `amount` goes under: the everyday one first, then the raise. */
export function grantFor(room: AllowanceRoom, amount: bigint): AllowanceGrant | undefined {
  if (room.base && room.base.room >= amount) return room.base.grant;
  if (room.boost && room.boost.room >= amount) return room.boost.grant;
  return undefined;
}

/** Counts each kind of grant that is on (for the exit kit and the receipt). */
export async function activeGrantCounts(db: Executor, userId: string, network: NetworkId) {
  const rows = await db
    .select({ kind: grants.kind, count: sql<number>`count(*)::int` })
    .from(grants)
    .where(and(eq(grants.userId, userId), eq(grants.network, network), eq(grants.status, "active")))
    .groupBy(grants.kind);
  return Object.fromEntries(rows.map((row) => [row.kind, row.count])) as Partial<Record<GrantRow["kind"], number>>;
}
