// Money-rails tools (builder B1): Kawase Margin (long/short on Aave V4). Spread into buildTools; each reads or acts
// through the injected context, already scoped to the person and their network (K2). Nothing moves from a call: an
// order is a card the person slides to confirm (R5).
import { tool } from "ai";
import { z } from "zod";

import type { AgentContext } from "./context";
import { destinationAddress } from "./trust";

const MARKET_MAX = 40;
const LEVERAGE_MIN = 1;
const LEVERAGE_MAX = 10;
const UNAVAILABLE = { summary: "This is not available here." };

const CHAINS = ["base", "ethereum", "arbitrum", "optimism", "polygon", "avalanche"] as const;
const RECIPIENT_MAX = 80;
const VENUE_MAX = 32;
/** The routes a move can be pinned to (CrossChainProvider); a race's pick is passed as one of these. */
const BRIDGE_VENUES = ["cctp", "across", "relay", "lifi", "debridge", "socket", "gaszip"] as const;
/** A race may name a bridge Kawase cannot pin a move to yet: then the move takes the best fresh quote, as before. */
const pinnable = (venue: string | undefined) => (BRIDGE_VENUES as readonly string[]).includes(venue ?? "") ? (venue as (typeof BRIDGE_VENUES)[number]) : null;

/** A symbol, a 0x address (42), or an amount. */
const ASSET_MAX = 64;

export function railsTools(context: AgentContext) {
  return {
    compare_yield: tool({
      description:
        "Where an asset can earn now, compared: Aave V4 (supply rate, what it can pay out right now), Morpho vaults (only those that could give the money back; low liquidity flagged) and Aero LP pools with Merkl rewards (advanced: impermanent loss and range risk; propose_lp deposits). Ranked by yield among sources that could return the amount. Pass the asset (USDC by default) and the amount if they said one. The card lets them deposit.",
      inputSchema: z.object({
        asset: z.string().max(ASSET_MAX).optional(),
        amount: z.string().regex(/^\d+(\.\d+)?$/).optional(),
        venue: z.string().max(VENUE_MAX).optional().describe("The venue race_routes suggested or the person picked (aave, morpho, merkl); it is quoted again and shown first"),
      }),
      execute: async ({ asset, amount, venue }) => (context.compareYield ? context.compareYield({ asset: asset ?? "USDC", amount: amount ?? null, venue: venue ?? null }) : UNAVAILABLE),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    propose_supply: tool({
      description:
        "Prepare putting an asset into Aave V4 to earn (or taking it back out with withdraw; 'all' for everything). Pass the asset and the amount as digits with a dot. Kawase checks the balance and, for a withdrawal, the account's health; the person confirms on the card.",
      inputSchema: z.object({ action: z.enum(["supply", "withdraw"]), asset: z.string().max(ASSET_MAX), amount: z.string().max(ASSET_MAX).optional() }),
      execute: async ({ action, asset, amount }) => (context.proposeLend ? context.proposeLend({ action, asset, amount: amount ?? null }) : UNAVAILABLE),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    propose_lp: tool({
      description:
        "Aero liquidity on Arc mainnet (advanced): deposit into USDC-EURC, cirBTC-USDC or WETH-USDC from one asset of the pair (Kawase buys the other side and sets a range around today's price: 1% each side for USDC-EURC, 10% for the others), withdraw a position (both sides back, fees included), or claim Merkl's USDC rewards. Pass the pool or the asset they named and the amount as digits with a dot. Earns the pool's fees and Merkl's rewards only while the price stays in range; out of range it earns nothing and sits all in one side (impermanent loss). Nothing moves from this call: the card opens the LP screen, where they confirm with Face ID.",
      inputSchema: z.object({
        action: z.enum(["deposit", "withdraw", "claim"]),
        pool: z.string().max(ASSET_MAX).optional().describe("The pair they named, e.g. cirBTC-USDC"),
        asset: z.string().max(ASSET_MAX).optional().describe("The asset they pay in (one side of the pair)"),
        amount: z.string().regex(/^\d+(\.\d+)?$/).optional(),
      }),
      execute: async ({ action, pool, asset, amount }) => (context.proposeLp ? context.proposeLp({ action, pool: pool ?? null, asset: asset ?? null, amount: amount ?? null }) : UNAVAILABLE),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    propose_borrow: tool({
      description:
        "Prepare borrowing on Aave V4 (Arc mainnet): the asset to borrow (USDC, EURC, cirBTC, WETH) and how much, and, if they want to put collateral in now, which asset and how much (cirBTC, WETH or USDC; EURC cannot be collateral). Kawase computes the health after (refused below 1.25), the rate and shows a card; the person confirms with Face ID.",
      inputSchema: z.object({
        asset: z.string().max(ASSET_MAX).describe("What to borrow"),
        amount: z.string().regex(/^\d+(\.\d+)?$/).optional(),
        collateralAsset: z.string().max(ASSET_MAX).optional(),
        collateralAmount: z.string().regex(/^\d+(\.\d+)?$/).optional(),
      }),
      execute: async ({ asset, amount, collateralAsset, collateralAmount }) =>
        context.proposeLend ? context.proposeLend({ action: "borrow", asset, amount: amount ?? null, collateralAsset: collateralAsset ?? null, collateralAmount: collateralAmount ?? null }) : UNAVAILABLE,
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    propose_repay: tool({
      description: "Prepare repaying an Aave V4 loan: the asset and the amount, or 'all' to repay everything owed (interest included). The person confirms on the card.",
      inputSchema: z.object({ asset: z.string().max(ASSET_MAX), amount: z.string().max(ASSET_MAX).optional().describe("Digits with a dot, or all") }),
      execute: async ({ asset, amount }) => (context.proposeLend ? context.proposeLend({ action: "repay", asset, amount: amount ?? "all" }) : UNAVAILABLE),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    propose_bridge: tool({
      description:
        "Prepare moving money from Arc to another chain (Base, Ethereum, Arbitrum, Optimism, Polygon, Avalanche) for the person themselves or anyone else: any asset they hold on Arc (USDC by default; WETH, EURC, cirBTC, a meme by symbol or address). Pass the recipient only if they named one (a saved contact, a @handle or an address they gave). Kawase quotes every route that serves it (USDC: Circle CCTP, Across, Relay, LI.FI, deBridge; other assets: LI.FI and deBridge, arriving as the same asset, e.g. cirBTC as cbBTC), ranks them by what arrives after fees, and shows up to three on a card with the best chosen. When nothing carries the asset as itself it arrives as USDC (swapped on Arc in the same transaction). The person can pick another route and confirms with Face ID. Nothing moves from this call.",
      inputSchema: z.object({
        destination: z.enum(CHAINS).optional().describe("The chain they named; omit if they did not say"),
        asset: z.string().max(ASSET_MAX).optional().describe("The asset to move, as they said it (\"WETH\", \"cirBTC\", an address); omit for USDC"),
        amount: z.string().regex(/^\d+(\.\d+)?$/).optional().describe("In that asset, digits with a dot; omit if they did not say"),
        recipient: z.string().max(RECIPIENT_MAX).optional().describe("Only who they named: a contact, @handle or address; omit for themselves"),
        toAsset: z.literal("USDC").optional().describe("Only if they asked for it to arrive as USDC"),
        venue: z.string().max(VENUE_MAX).optional().describe("The route race_routes suggested or the person picked (its id, e.g. relay); Kawase quotes it again"),
      }),
      execute: async ({ destination, asset, amount, recipient, toAsset, venue }) => {
        if (!context.proposeCrossChain) return UNAVAILABLE;
        // K2 (M8): an address must be the person's own words; their own address means themselves (Kawase fills it in).
        const own = recipient && /^0x/i.test(recipient.trim()) ? (await destinationAddress(context, recipient, "Omit the recipient for themselves.")) === "own" : false;
        return context.proposeCrossChain({ direction: "out", destination: destination ?? null, asset: asset ?? null, amount: amount ?? null, recipient: own ? null : (recipient ?? null), toAsset: toAsset ?? null, route: pinnable(venue) });
      },
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    bring_to_arc: tool({
      description:
        "Bring money the person holds at their own address on another chain (Base, Ethereum, Arbitrum, Optimism, Polygon, Avalanche) to Arc. USDC is gasless: they sign one permit (no ETH needed there) and Relay delivers on Arc in seconds. The chain's own coin (ETH, POL, AVAX) goes in one transaction there, its gas paid from the coin, and arrives as the same asset on Arc (ETH as WETH). Another token goes with one signature once it is approved for Permit2 there. Pass the chain only if they named one (else the chain holding the most of it), the asset only if not USDC, and the amount only if they said one. Shows a card; nothing moves from this call.",
      inputSchema: z.object({
        source: z.enum(CHAINS).optional(),
        asset: z.string().max(ASSET_MAX).optional().describe("\"ETH\", \"EURC\", \"WETH\"…; omit for USDC"),
        amount: z.string().regex(/^\d+(\.\d+)?$/).optional(),
        venue: z.string().max(VENUE_MAX).optional().describe("The route race_routes suggested or the person picked (its id, e.g. relay); Kawase quotes it again"),
      }),
      execute: async ({ source, asset, amount, venue }) =>
        context.proposeCrossChain ? context.proposeCrossChain({ direction: "in", source: source ?? null, asset: asset ?? null, amount: amount ?? null, route: pinnable(venue) }) : UNAVAILABLE,
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
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
    protect_position: tool({
      description:
        "Set a take-profit and/or a stop-loss on an open long/short (Kawase Margin): Kawase closes the whole position for the person when the price gets there, checked on a real quote. Pass the position id from get_positions (or the market and side), and each price in US dollars only if they said one (\"off\" removes it). A take-profit is past today's price, a stop-loss before it and before liquidation. The first time, the card asks them to let Kawase close positions for them (one Face ID). Mainnet only.",
      inputSchema: z.object({
        positionId: z.uuid().optional(),
        market: z.string().max(MARKET_MAX).optional(),
        side: z.enum(["long", "short"]).optional(),
        takeProfit: z.union([z.string().regex(/^\d+(\.\d+)?$/), z.literal("off")]).optional(),
        stopLoss: z.union([z.string().regex(/^\d+(\.\d+)?$/), z.literal("off")]).optional(),
      }),
      execute: async ({ positionId, market, side, takeProfit, stopLoss }) =>
        context.protectPosition
          ? context.protectPosition({ positionId: positionId ?? null, market: market ?? null, side: side ?? null, takeProfit: takeProfit === "off" ? null : takeProfit, stopLoss: stopLoss === "off" ? null : stopLoss })
          : UNAVAILABLE,
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
  };
}
