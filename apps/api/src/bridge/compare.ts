// compare_bridge_routes (ARCHITECTURE §8; `02-defi-bridge-trade/cheapest-route-design.md`): fresh quotes for the same
// transfer from the routes that serve Arc, ranked by what arrives. Checked against each provider's own api on
// 2026-10-01: LI.FI lists Arc (5042) and Arc Testnet (5042002) and quoted Arc → Base mainnet (Polymer); Relay and
// deBridge list Arc mainnet only; Across lists neither. Kawase executes the Circle CCTP route through App Kit, the
// one whose calldata it decodes and checks end to end (burn amount, recipient, domain, fee cap); the others are
// shown with their live numbers and why they were not used, never as executable.
import type { Address } from "viem";

import type { NetworkContext } from "@kawase/networks";

/** Why a route was not used, as a code the app words in the person's language. */
export type RouteReason = "quote_only" | "no_quote" | "timeout" | "not_on_arc_testnet" | "not_on_arc";

export type RouteQuote = {
  provider: string;
  /** USDC base units that would arrive, when the provider quoted. */
  received: bigint | null;
  status: "chosen" | "quoted" | "unavailable";
  reason: RouteReason | null;
};

const QUOTE_TIMEOUT_MS = 6_000;
/** Below any real quote, so routes without one sort last. */
const NO_QUOTE = -1n;
const LIFI = "https://li.quest/v1/quote";
const RELAY = { mainnet: "https://api.relay.link/quote", testnet: "https://api.testnets.relay.link/quote" } as const;
const DEBRIDGE = "https://dln.debridge.finance/v1.0/dln/order/quote";

type Transfer = { network: NetworkContext; from: Address; recipient: Address; amount: bigint; destinationChainId: number; destinationUsdc: Address };

async function json(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS) });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, body };
}

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
    const estimate = body.estimate as { toAmount?: string } | undefined;
    if (!ok || !estimate?.toAmount) return { provider: "LI.FI", received: null, status: "unavailable", reason: "no_quote" };
    return { provider: `LI.FI (${String(body.tool ?? "aggregator")})`, received: BigInt(estimate.toAmount), status: "quoted", reason: "quote_only" };
  } catch {
    return { provider: "LI.FI", received: null, status: "unavailable", reason: "timeout" };
  }
}

async function relay(t: Transfer): Promise<RouteQuote> {
  if (!t.network.isRealMoney) return { provider: "Relay", received: null, status: "unavailable", reason: "not_on_arc_testnet" };
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
    const out = (body.details as { currencyOut?: { amount?: string } } | undefined)?.currencyOut?.amount;
    if (!ok || !out) return { provider: "Relay", received: null, status: "unavailable", reason: "no_quote" };
    return { provider: "Relay", received: BigInt(out), status: "quoted", reason: "quote_only" };
  } catch {
    return { provider: "Relay", received: null, status: "unavailable", reason: "timeout" };
  }
}

async function debridge(t: Transfer): Promise<RouteQuote> {
  if (!t.network.isRealMoney) return { provider: "deBridge", received: null, status: "unavailable", reason: "not_on_arc_testnet" };
  const query = new URLSearchParams({
    srcChainId: String(t.network.chainId),
    srcChainTokenIn: t.network.addresses.usdc,
    srcChainTokenInAmount: t.amount.toString(),
    dstChainId: String(t.destinationChainId),
    dstChainTokenOut: t.destinationUsdc,
  });
  try {
    const { ok, body } = await json(`${DEBRIDGE}?${query}`);
    const out = (body.estimation as { dstChainTokenOut?: { amount?: string } } | undefined)?.dstChainTokenOut?.amount;
    if (!ok || !out) return { provider: "deBridge", received: null, status: "unavailable", reason: "no_quote" };
    return { provider: "deBridge", received: BigInt(out), status: "quoted", reason: "quote_only" };
  } catch {
    return { provider: "deBridge", received: null, status: "unavailable", reason: "timeout" };
  }
}

const across = (): RouteQuote => ({ provider: "Across", received: null, status: "unavailable", reason: "not_on_arc" });

/**
 * The executed route first (Circle CCTP: native USDC burned and minted, no pool or wrapped token, Circle's forwarder
 * pays the destination gas), then the others by what would arrive.
 */
export async function compareRoutes(t: Transfer, cctpReceived: bigint): Promise<RouteQuote[]> {
  const others = await Promise.all([lifi(t), relay(t), debridge(t)]);
  // Routes that quoted come first, the most arriving at the top; the rest keep their order.
  const arriving = (quote: RouteQuote) => quote.received ?? NO_QUOTE;
  const ranked = [...others, across()].sort((a, b) => (arriving(b) > arriving(a) ? 1 : arriving(b) < arriving(a) ? -1 : 0));
  return [{ provider: "Circle CCTP · App Kit", received: cctpReceived, status: "chosen", reason: null }, ...ranked];
}
