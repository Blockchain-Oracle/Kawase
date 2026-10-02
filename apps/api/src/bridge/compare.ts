// compare_bridge_routes (ARCHITECTURE §8; `02-defi-bridge-trade/cheapest-route-design.md`; plan/product/routes.md):
// fresh quotes for the same transfer from every route that serves Arc, ranked by what arrives net of anything the
// person pays on top (routes.md ranking rule). Checked against each provider's own api on 2026-10-02:
// - LI.FI lists Arc (5042) and Arc Testnet (5042002);
// - Relay lists Arc mainnet;
// - Across serves Arc both ways on mainnet (`available-routes`: 23 out, 18 in; `suggested-fees` 50 USDC Arc → Base:
//   49.991 out, ~2 s) and not Arc Testnet ("Route is not enabled") — gaps.md G3;
// - deBridge knows Arc USDC only as the chain's native coin `0x000…0` with 18 decimals (the ERC-20 view `0x3600…`
//   is "not supported"), and charges a flat `fixFee` in that coin on top of the amount — gaps.md G4.
// Kawase executes the Circle CCTP route through App Kit, the one whose calldata it decodes and checks end to end
// (burn amount, recipient, domain, fee cap); the others are shown with their live numbers.
import type { Address } from "viem";

import { USDC_NATIVE_DECIMALS, decimalsOf, rescale } from "@kawase/money";
import type { NetworkContext } from "@kawase/networks";

/** Why a route was not used, as a code the app words in the person's language. */
export type RouteReason = "quote_only" | "no_quote" | "timeout" | "not_on_arc_testnet" | "not_on_arc" | "amount_too_low";

export type RouteQuote = {
  provider: string;
  /** USDC base units that would arrive, when the provider quoted. */
  received: bigint | null;
  /** USDC base units the person pays on top of the amount (deBridge's flat fee), counted against `received` in ranking. */
  extraCost: bigint;
  /** The provider's own fill estimate, when it gives one. */
  etaSeconds: number | null;
  status: "chosen" | "quoted" | "unavailable";
  reason: RouteReason | null;
};

const QUOTE_TIMEOUT_MS = 6_000;
/** Below any real quote, so routes without one sort last. */
const NO_QUOTE = -1n;
const ZERO = 0n;
const ONE = 1n;
const NATIVE: Address = "0x0000000000000000000000000000000000000000";
const LIFI = "https://li.quest/v1/quote";
const RELAY = { mainnet: "https://api.relay.link/quote", testnet: "https://api.testnets.relay.link/quote" } as const;
const DEBRIDGE = "https://dln.debridge.finance/v1.0/dln/order/quote";
const ACROSS = "https://app.across.to/api/suggested-fees";
const DEBRIDGE_ATTEMPTS = 4;

type Transfer = { network: NetworkContext; from: Address; recipient: Address; amount: bigint; destinationChainId: number; destinationUsdc: Address };

const unavailable = (provider: string, reason: RouteReason): RouteQuote => ({ provider, received: null, extraCost: ZERO, etaSeconds: null, status: "unavailable", reason });
const quoted = (provider: string, received: bigint, extra: Partial<Pick<RouteQuote, "extraCost" | "etaSeconds">> = {}): RouteQuote => ({
  provider,
  received,
  extraCost: extra.extraCost ?? ZERO,
  etaSeconds: extra.etaSeconds ?? null,
  status: "quoted",
  reason: "quote_only",
});

async function json(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS) });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, body };
}

/** USDC native wei (18 decimals) → USDC base units (6), rounded up: a cost is never understated. */
const nativeToUsdc = (wei: bigint) => {
  const units = rescale(wei, USDC_NATIVE_DECIMALS, decimalsOf("USDC"));
  return rescale(units, decimalsOf("USDC"), USDC_NATIVE_DECIMALS) < wei ? units + ONE : units;
};

async function lifi(t: Transfer): Promise<RouteQuote> {
  const query = new URLSearchParams({
    fromChain: String(t.network.chainId),
    toChain: String(t.destinationChainId),
    fromToken: t.network.addresses.usdc,
    toToken: t.destinationUsdc,
    fromAmount: t.amount.toString(),
    fromAddress: t.from,
    toAddress: t.recipient,
  });
  try {
    const { ok, body } = await json(`${LIFI}?${query}`);
    const estimate = body.estimate as { toAmount?: string; executionDuration?: number } | undefined;
    if (!ok || !estimate?.toAmount) return unavailable("LI.FI", "no_quote");
    return quoted(`LI.FI (${String(body.tool ?? "aggregator")})`, BigInt(estimate.toAmount), { etaSeconds: estimate.executionDuration ?? null });
  } catch {
    return unavailable("LI.FI", "timeout");
  }
}

async function relay(t: Transfer): Promise<RouteQuote> {
  if (!t.network.isRealMoney) return unavailable("Relay", "not_on_arc_testnet");
  try {
    const { ok, body } = await json(RELAY.mainnet, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user: t.from,
        recipient: t.recipient,
        originChainId: t.network.chainId,
        destinationChainId: t.destinationChainId,
        originCurrency: t.network.addresses.usdc,
        destinationCurrency: t.destinationUsdc,
        amount: t.amount.toString(),
        tradeType: "EXACT_INPUT",
      }),
    });
    const details = body.details as { currencyOut?: { amount?: string }; timeEstimate?: number } | undefined;
    const out = details?.currencyOut?.amount;
    if (!ok || !out) return unavailable("Relay", "no_quote");
    return quoted("Relay", BigInt(out), { etaSeconds: details?.timeEstimate ?? null });
  } catch {
    return unavailable("Relay", "timeout");
  }
}

/** deBridge DLN: Arc USDC is the native coin to it (18 decimals); its flat `fixFee` is paid on top, in that coin. */
async function debridge(t: Transfer): Promise<RouteQuote> {
  if (!t.network.isRealMoney) return unavailable("deBridge", "not_on_arc_testnet");
  const query = new URLSearchParams({
    srcChainId: String(t.network.chainId),
    srcChainTokenIn: NATIVE,
    srcChainTokenInAmount: rescale(t.amount, decimalsOf("USDC"), USDC_NATIVE_DECIMALS).toString(),
    dstChainId: String(t.destinationChainId),
    dstChainTokenOut: t.destinationUsdc,
    // Its costs come out of what arrives, so `received` is for exactly this amount.
    prependOperatingExpenses: "false",
  });
  try {
    // Its quote api answers "Internal Error" to most Arc requests (3 of 4 on 10-02, ~0.5 s each); a few tries are cheap.
    let { ok, body } = await json(`${DEBRIDGE}?${query}`);
    for (let attempt = 1; attempt < DEBRIDGE_ATTEMPTS && body.errorId === "INTERNAL_SERVER_ERROR"; attempt++) ({ ok, body } = await json(`${DEBRIDGE}?${query}`));
    const out = (body.estimation as { dstChainTokenOut?: { amount?: string } } | undefined)?.dstChainTokenOut?.amount;
    if (body.errorId === "ERROR_LOW_GIVE_AMOUNT") return unavailable("deBridge", "amount_too_low");
    if (!ok || !out) return unavailable("deBridge", "no_quote");
    const fixFee = typeof body.fixFee === "string" ? nativeToUsdc(BigInt(body.fixFee)) : ZERO;
    const delay = (body.order as { approximateFulfillmentDelay?: number } | undefined)?.approximateFulfillmentDelay;
    return quoted("deBridge", BigInt(out), { extraCost: fixFee, etaSeconds: delay ?? null });
  } catch {
    return unavailable("deBridge", "timeout");
  }
}

/** Across: the relayer fee comes out of the amount; `isAmountTooLow` and the deposit limits are its own. */
async function across(t: Transfer): Promise<RouteQuote> {
  if (!t.network.isRealMoney) return unavailable("Across", "not_on_arc_testnet");
  const query = new URLSearchParams({
    inputToken: t.network.addresses.usdc,
    outputToken: t.destinationUsdc,
    originChainId: String(t.network.chainId),
    destinationChainId: String(t.destinationChainId),
    amount: t.amount.toString(),
    recipient: t.recipient,
  });
  try {
    const { ok, body } = await json(`${ACROSS}?${query}`);
    if (body.isAmountTooLow === true) return unavailable("Across", "amount_too_low");
    if (!ok || typeof body.outputAmount !== "string") return unavailable("Across", body.code === "ROUTE_NOT_ENABLED" ? "not_on_arc" : "no_quote");
    return quoted("Across", BigInt(body.outputAmount), { etaSeconds: typeof body.estimatedFillTimeSec === "number" ? body.estimatedFillTimeSec : null });
  } catch {
    return unavailable("Across", "timeout");
  }
}

/** What a route is worth to the person: what arrives less what they pay on top (routes.md ranking rule). */
export const netOf = (quote: Pick<RouteQuote, "received" | "extraCost">) => (quote.received === null ? NO_QUOTE : quote.received - quote.extraCost);

/** Best net first; ties go to the faster; routes without a quote keep their order at the end. */
export function rankRoutes<T extends Pick<RouteQuote, "received" | "extraCost" | "etaSeconds">>(routes: readonly T[]): T[] {
  return [...routes].sort((a, b) => {
    const gap = netOf(b) - netOf(a);
    if (gap !== ZERO) return gap > ZERO ? 1 : -1;
    return (a.etaSeconds ?? Number.MAX_SAFE_INTEGER) - (b.etaSeconds ?? Number.MAX_SAFE_INTEGER);
  });
}

/**
 * The executed route first (Circle CCTP: native USDC burned and minted, no pool or wrapped token, Circle's forwarder
 * pays the destination gas), then the others by what the person would end up with.
 */
export async function compareRoutes(t: Transfer, cctpReceived: bigint): Promise<RouteQuote[]> {
  const others = await Promise.all([lifi(t), relay(t), debridge(t), across(t)]);
  const chosen: RouteQuote = { provider: "Circle CCTP · App Kit", received: cctpReceived, extraCost: ZERO, etaSeconds: null, status: "chosen", reason: null };
  return [chosen, ...rankRoutes(others)];
}
