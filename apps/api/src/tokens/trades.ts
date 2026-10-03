// Profit and loss from the person's own trades of one token (surfaces.md "Token page"; plan §A.4 token extras): every
// completed Kawase swap that bought or sold it, in order, at average cost. A buy adds what arrived (the receipt) and
// what it cost in US dollars at the time (what was paid: USDC as itself, any other token at its price then). A sell
// realises the proceeds (USDC as itself, else the value then) against the average cost of what left. What is still
// held from those buys is valued at today's price. Tokens that came in other ways (received, bridged) are not trades.
import { and, asc, eq, inArray } from "drizzle-orm";
import { formatUnits } from "viem";

import type { SwapDraftView, TokenTradesView } from "@kawase/api-client";
import { intentDrafts, intents, txAttempts, type Db } from "@kawase/db";
import type { NetworkId } from "@kawase/networks";

type Row = { createdAt: Date; payload: unknown; receipt: unknown };

const ZERO = 0n;
const USD_DECIMALS = 6;

const units = (value: bigint, decimals: number) => Number(formatUnits(value, decimals));

export async function tokenTrades(db: Db, input: { userId: string; network: NetworkId; token: string; usdc: string; priceUsd: number | null }): Promise<TokenTradesView | null> {
  const token = input.token.toLowerCase();
  const usdc = input.usdc.toLowerCase();
  const rows: Row[] = await db
    .select({ createdAt: intents.createdAt, payload: intentDrafts.payload, receipt: txAttempts.receipt })
    .from(intents)
    .innerJoin(intentDrafts, and(eq(intentDrafts.intentId, intents.id), eq(intentDrafts.version, intents.currentDraftVersion)))
    .innerJoin(txAttempts, and(eq(txAttempts.intentId, intents.id), inArray(txAttempts.status, ["confirmed"])))
    .where(and(eq(intents.userId, input.userId), eq(intents.network, input.network), eq(intents.kind, "swap"), eq(intents.state, "completed")))
    .orderBy(asc(intents.createdAt));

  let trades = 0;
  let bought = ZERO;
  let sold = ZERO;
  let held = ZERO;
  let cost = 0;
  let realized = 0;
  let decimals = 0;
  let last: Date | null = null;
  for (const row of rows) {
    const view = (row.payload as { view?: SwapDraftView | null } | null)?.view;
    const received = (row.receipt as { received?: string } | null)?.received;
    if (!view?.tokens || !received) continue;
    const tokenIn = view.tokens.in.address.toLowerCase();
    const tokenOut = view.tokens.out.address.toLowerCase();
    const amountIn = BigInt(view.amountIn);
    const amountOut = BigInt(received);
    if (tokenOut === token) {
      // A buy: what arrived, at what was paid for it.
      decimals = view.tokens.out.decimals;
      const paidUsd = tokenIn === usdc ? units(amountIn, USD_DECIMALS) : (view.valueUsd ?? null);
      if (paidUsd === null) continue;
      bought += amountOut;
      held += amountOut;
      cost += paidUsd;
    } else if (tokenIn === token) {
      // A sell: what left, against its average cost; the proceeds at what came back.
      decimals = view.tokens.in.decimals;
      const proceedsUsd = tokenOut === usdc ? units(amountOut, USD_DECIMALS) : (view.valueUsd ?? null);
      if (proceedsUsd === null) continue;
      const leaving = amountIn > held ? held : amountIn;
      const average = held > ZERO ? cost / units(held, decimals) : 0;
      const costOut = average * units(leaving, decimals);
      realized += proceedsUsd - costOut;
      cost -= costOut;
      held -= leaving;
      sold += amountIn;
    } else continue;
    trades += 1;
    last = row.createdAt;
  }
  if (trades === 0) return null;
  const heldUnits = units(held, decimals);
  return {
    trades,
    bought: bought.toString(),
    sold: sold.toString(),
    held: held.toString(),
    avgCostUsd: held > ZERO ? cost / heldUnits : null,
    costBasisUsd: cost,
    realizedUsd: realized,
    unrealizedUsd: input.priceUsd !== null && held > ZERO ? heldUnits * input.priceUsd - cost : null,
    lastTradeAt: last?.toISOString() ?? null,
  };
}
