// Money-rails tools (builder B1): Kawase Margin (long/short on Aave V4). Spread into buildTools; each reads or acts
// through the injected context, already scoped to the person and their network (K2). Nothing moves from a call: an
// order is a card the person slides to confirm (R5).
import { tool } from "ai";
import { z } from "zod";

import type { AgentContext } from "./context";

const MARKET_MAX = 40;
const LEVERAGE_MIN = 1;
const LEVERAGE_MAX = 10;
const UNAVAILABLE = { summary: "This is not available here." };

export function railsTools(context: AgentContext) {
  return {
    start_buy: tool({
      description:
        "Buy with Apple Pay, Google Pay or a debit card (Circle's Onramp). It delivers USDC or EURC on Arc to the person's own wallet; for any other token, pass it as `then` and Kawase swaps what arrives (one more approval). Pass the amount in dollars or euros only if they said one. Shows a card: the person taps it to open Circle's checkout in the browser sheet; the money is confirmed when it arrives on chain. On testnet it is Circle's sandbox (test cards). Nothing is charged from this call.",
      inputSchema: z.object({
        amount: z.string().regex(/^\d+(\.\d+)?$/).optional().describe("Fiat amount as digits with a dot; omit if they did not say"),
        asset: z.enum(["USDC", "EURC"]).optional().describe("Only if they asked for dollars or euros by name"),
        then: z.string().max(MARKET_MAX).optional().describe("A token to end with (\"cirBTC\", \"ARGUS\"), when they want something other than USDC/EURC"),
      }),
      execute: async ({ amount, asset, then }) => (context.proposeBuy ? context.proposeBuy({ amount: amount ?? null, asset: asset ?? null, then: then ?? null }) : UNAVAILABLE),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    get_markets: tool({
      description:
        "Kawase Margin markets for going long or short with leverage (Aave V4 on Arc mainnet; computed from its live reserves): each market's price, whether long and short are possible and the highest leverage each allows, and borrow rates. Use before proposing an order when the person asks what they can trade long/short, or for a market's limits.",
      inputSchema: z.object({}),
      execute: async () => (context.marginMarkets ? context.marginMarkets() : UNAVAILABLE),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    propose_perp_order: tool({
      description:
        "Prepare a leveraged long or short (Kawase Margin through the person's own Aave V4 account, mainnet). Pass the market as the person said it (\"BTC\", \"ETH\", \"cirBTC\", \"EURC\"), the side, the margin in USDC as digits with a dot, and the leverage only if they said one (Kawase uses 2× otherwise, within the market's cap). Kawase plans the whole order as one batch, shows the exposure, liquidation price and borrow rate on a card, and the person slides to confirm. Nothing moves from this call.",
      inputSchema: z.object({
        market: z.string().max(MARKET_MAX).optional().describe("The market as said; omit if they did not say"),
        side: z.enum(["long", "short"]).optional(),
        margin: z.string().regex(/^\d+(\.\d+)?$/).optional().describe("USDC put in, digits with a dot; omit if they did not say"),
        leverage: z.number().min(LEVERAGE_MIN).max(LEVERAGE_MAX).optional().describe("Only if they said one, e.g. 2 or 3"),
      }),
      execute: async ({ market, side, margin, leverage }) =>
        context.proposeMargin ? context.proposeMargin({ action: "open", market: market ?? null, side: side ?? null, margin: margin ?? null, leverage: leverage ?? null }) : UNAVAILABLE,
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    get_positions: tool({
      description: "The person's open long and short positions (Kawase Margin): side, leverage, P&L, liquidation price, account health and each position's id.",
      inputSchema: z.object({}),
      execute: async () => (context.marginPositions ? context.marginPositions() : UNAVAILABLE),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    close_position: tool({
      description:
        "Prepare closing all or part of a long/short position. Pass the position id from get_positions (or the market and side), and the share to close only if they said one (0.25, 0.5, 0.75; all by default). Kawase plans the unwind as one batch and shows what comes back; the person slides to confirm.",
      inputSchema: z.object({
        positionId: z.uuid().optional(),
        market: z.string().max(MARKET_MAX).optional(),
        side: z.enum(["long", "short"]).optional(),
        fraction: z.number().gt(0).max(1).optional(),
      }),
      execute: async ({ positionId, market, side, fraction }) =>
        context.proposeMargin ? context.proposeMargin({ action: "close", positionId: positionId ?? null, market: market ?? null, side: side ?? null, fraction: fraction ?? null }) : UNAVAILABLE,
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
  };
}
