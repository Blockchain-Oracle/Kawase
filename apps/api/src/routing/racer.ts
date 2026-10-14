// The route race for a person: what the agent's `race_routes` tool and the RouteList stream from. It resolves what
// was asked (tokens, the destination chain, the wallet), builds one attempt per venue and hands them to `raceRoutes`.
// Read-only: quotes only; the swap, move and earn services build and check the calls once a route is picked.
// A guest (no wallet yet) races with a neutral taker address, so the prices are real before signing in.
import { formatUnits, getAddress, isAddress, parseUnits, type Address, type PublicClient } from "viem";

import type { RouteQuote, RouteRace, RouteRaceRequest } from "@kawase/api-client";
import { CROSSCHAIN, DEFAULT_LIMITS } from "@kawase/config";
import type { BridgeDestination } from "@kawase/integrations-app-kit";
import { acrossQuote, BridgeProviderError, DEBRIDGE_NATIVE, debridgeQuote, gasZipQuote, LIFI_NATIVE, lifiQuote, relayQuote, SOCKET_NATIVE, socketQuote } from "@kawase/integrations-bridges";
import { CROSSCHAIN_PROVIDERS } from "@kawase/intents";
import { venueKey } from "@kawase/identity";
import { USDC_NATIVE_DECIMALS, rescale } from "@kawase/money";
import { CANONICAL_TOKENS, normalizeSymbol, type NetworkContext, type NetworkId } from "@kawase/networks";

import type { BridgeEngine } from "../bridge/engine";
import { NATIVE_SYMBOLS } from "../crosschain/assets";
import type { AssetService } from "../tokens/service";
import type { SessionUser } from "../types";
import type { Chains } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import { failureOf, SWAP_VENUES, type SwapVenues } from "../swap/venues";
import type { YieldOptionsView } from "@kawase/api-client";
import { routeFromVenueFailure, routeFromVenueQuote, routeFromYield, venueName, type TokenMeta } from "./mappers";
import { checkingRow, failedRow, raceRoutes, type RaceAttempt, type RaceOptions } from "./race";

/** Quotes for someone without a wallet yet are asked for this neutral address (never a signer). */
export const QUOTE_ONLY_TAKER: Address = "0x000000000000000000000000000000000000dEaD";
const USDC_DECIMALS = 6;
const NATIVE_DECIMALS = 18;
const STABLE_KINDS = new Set(["dollar", "fiat"]);
type Bridge = "cctp" | "across" | "relay" | "lifi" | "debridge" | "socket" | "gaszip";
const ZERO = 0n;
const TRUST: Record<Bridge, "burn_mint" | "solver"> = { cctp: "burn_mint", across: "solver", relay: "solver", lifi: "solver", debridge: "solver", socket: "solver", gaszip: "solver" };
const CHAIN_NAMES: Record<string, string> = { base: "Base", ethereum: "Ethereum", arbitrum: "Arbitrum", optimism: "OP Mainnet", polygon: "Polygon", avalanche: "Avalanche" };

export type RouteRacerDeps = {
  chains: Chains;
  wallets: Pick<WalletService, "userWallet">;
  venues: SwapVenues;
  bridges: BridgeEngine;
  assets?: AssetService | undefined;
  /** The yield list (LendService.options). */
  yieldOptions?: ((user: SessionUser | undefined, asset: string, amount: string | null) => Promise<YieldOptionsView>) | undefined;
};

export class RaceInputError extends Error {
  constructor(readonly code: "network_unavailable" | "unknown_token" | "invalid_amount" | "unknown_chain" | "same_token" | "not_available") {
    super(code);
    this.name = "RaceInputError";
  }
}

/** A move that the move service can execute today (its draft format lists the provider). */
const executableBridge = (provider: Bridge) => (CROSSCHAIN_PROVIDERS as readonly string[]).includes(provider);

const bridgeRow = (provider: Bridge, received: bigint, output: TokenMeta, extra: Partial<RouteQuote> & { extraCost?: bigint; minReceived?: bigint | null; fillSeconds?: number | null; amountIn?: bigint | undefined; via?: string | null } = {}): RouteQuote => {
  const { extraCost = 0n, minReceived = null, fillSeconds = null, amountIn, via = null, ...rest } = extra;
  const net = received - extraCost;
  const feeUnits = amountIn !== undefined && output.decimals === USDC_DECIMALS ? amountIn - received + extraCost : null;
  return {
    venue: provider,
    mark: venueKey(provider),
    label: venueName(provider),
    status: "quoted",
    receive: { amount: received.toString(), symbol: output.symbol, decimals: output.decimals },
    net: net.toString(),
    feeUsd: feeUnits !== null && output.symbol === "USDC" ? Number(formatUnits(feeUnits > ZERO ? feeUnits : ZERO, USDC_DECIMALS)) : null,
    etaSeconds: fillSeconds,
    detail: via ? [via] : [],
    executable: executableBridge(provider),
    reason: executableBridge(provider) ? null : "not_enabled",
    facts: [{ kind: "trust", value: TRUST[provider] }, ...(via ? [{ kind: "via" as const, value: via }] : []), ...(minReceived !== null ? [{ kind: "min_receive" as const, value: minReceived.toString() }] : []), ...(extraCost > ZERO ? [{ kind: "flat_fee" as const, value: extraCost.toString() }] : [])],
    minReceive: minReceived?.toString() ?? null,
    ...rest,
  };
};

const bridgeFailure = (row: RouteQuote, error: unknown): RouteQuote[] => {
  const code = error instanceof BridgeProviderError ? error.code : (error as { code?: string } | undefined)?.code;
  return [failedRow(row, code === "amount_too_low" ? "amount_too_low" : code === "timeout" ? "timeout" : code === "rate_limited" ? "rate_limited" : "no_route")];
};

/** "10.5" of a token with `decimals`; anything else is not an amount. */
function amountOf(text: string, decimals: number): bigint {
  const value = text.trim();
  if (!/^\d+(\.\d+)?$/.test(value) || (value.split(".")[1]?.length ?? 0) > decimals) throw new RaceInputError("invalid_amount");
  const units = parseUnits(value, decimals);
  if (units <= ZERO) throw new RaceInputError("invalid_amount");
  return units;
}

export function createRouteRacer(deps: RouteRacerDeps) {
  const clientsOf = (network: NetworkId) => {
    const clients = deps.chains.get(network);
    if (!clients) throw new RaceInputError("network_unavailable");
    return clients;
  };
  const walletOf = async (user: SessionUser | undefined): Promise<Address> => {
    const address = user ? (await deps.wallets.userWallet(user.id))?.address : undefined;
    return address ? getAddress(address) : QUOTE_ONLY_TAKER;
  };
  /** A token as asked: a verified symbol or an address, with its symbol, decimals and whether it is a currency. */
  const tokenOf = async (network: NetworkContext, client: PublicClient, text: string) => {
    const wanted = text.trim();
    const canonical = CANONICAL_TOKENS[network.id].find((token) => normalizeSymbol(token.symbol) === normalizeSymbol(wanted) || (isAddress(wanted) && token.address.toLowerCase() === wanted.toLowerCase()));
    if (canonical) return { address: getAddress(canonical.address), symbol: canonical.symbol, decimals: canonical.decimals, stable: STABLE_KINDS.has(canonical.kind) };
    if (isAddress(wanted) && deps.assets) {
      const described = (await deps.assets.directory.describe(network.id, network.chainId, client, [wanted.toLowerCase()]).catch(() => undefined))?.get(wanted.toLowerCase());
      if (described && described.status !== "impersonator") return { address: getAddress(described.address), symbol: described.symbol, decimals: described.decimals, stable: false };
    }
    throw new RaceInputError("unknown_token");
  };

  return {
    /** Every swap venue for `amount` of `tokenIn` → `tokenOut` on the person's network. */
    async swap(user: SessionUser | undefined, request: Extract<RouteRaceRequest, { kind: "swap" }>, options: RaceOptions = {}): Promise<AsyncGenerator<RouteRace>> {
      const network: NetworkId = user?.activeNetwork ?? "mainnet";
      const { network: context, client } = clientsOf(network);
      const [tokenIn, tokenOut, from] = await Promise.all([tokenOf(context, client, request.tokenIn), tokenOf(context, client, request.tokenOut), walletOf(user)]);
      if (tokenIn.address === tokenOut.address) throw new RaceInputError("same_token");
      const amountIn = amountOf(request.amount, tokenIn.decimals);
      const limits = DEFAULT_LIMITS[network];
      const slippageBps = tokenIn.stable && tokenOut.stable ? limits.maxSlippageStableBps : limits.maxSlippageOtherBps;
      const out: TokenMeta = { symbol: tokenOut.symbol, decimals: tokenOut.decimals };
      const attempts: RaceAttempt[] = deps.venues
        .quoteEach({ network: context, client, from, tokenIn: tokenIn.address, tokenOut: tokenOut.address, amountIn, decimalsIn: tokenIn.decimals, decimalsOut: tokenOut.decimals, slippageBps }, SWAP_VENUES)
        .map((attempt) => {
          const pending = checkingRow(attempt.venue, venueKey(attempt.venue), venueName(attempt.venue));
          return {
            pending: [pending],
            result: attempt.result.then(
              (quote) => [quote.estimatedOut > ZERO ? routeFromVenueQuote(quote, out) : failedRow(pending, "no_route")],
              (error: unknown) => [routeFromVenueFailure(failureOf(attempt.venue, error))],
            ),
          };
        });
      return raceRoutes("swap", attempts, { ...options, ask: { amount: amountIn.toString(), symbol: tokenIn.symbol, decimals: tokenIn.decimals, to: tokenOut.symbol } });
    },

    /** Every bridge for `amount` USDC out of Arc to `destination` (USDC there, or its gas coin with `toAsset`). */
    async bridge(user: SessionUser | undefined, request: Extract<RouteRaceRequest, { kind: "bridge" }>, options: RaceOptions = {}): Promise<AsyncGenerator<RouteRace>> {
      const network: NetworkId = user?.activeNetwork ?? "mainnet";
      const { network: context, client } = clientsOf(network);
      const wanted = request.destination.trim().toLowerCase();
      const chain: BridgeDestination | undefined = deps.bridges.destinations(context).find((entry) => entry.id === wanted || String(entry.chainId) === wanted || (CHAIN_NAMES[entry.id] ?? "").toLowerCase() === wanted);
      if (!chain) throw new RaceInputError("unknown_chain");
      if (request.asset && normalizeSymbol(request.asset) !== normalizeSymbol("USDC")) throw new RaceInputError("not_available");
      const amount = amountOf(request.amount, USDC_DECIMALS);
      const wallet = await walletOf(user);
      const recipient = request.recipient && isAddress(request.recipient) ? getAddress(request.recipient) : wallet;
      const gasCoin = NATIVE_SYMBOLS[chain.chainId];
      const wantGas = Boolean(gasCoin && request.toAsset && normalizeSymbol(request.toAsset) === normalizeSymbol(gasCoin));
      const output: TokenMeta = wantGas ? { symbol: gasCoin!, decimals: NATIVE_DECIMALS } : { symbol: "USDC", decimals: USDC_DECIMALS };
      const outToken: Address = wantGas ? SOCKET_NATIVE : chain.usdc;
      const testnet = !context.isRealMoney;
      const stable = !wantGas;
      const slippageBps = stable ? CROSSCHAIN.stableSlippageBps : CROSSCHAIN.volatileSlippageBps;

      const attempt = (provider: Bridge, ask: () => Promise<RouteQuote[]>): RaceAttempt => {
        const pending = checkingRow(provider, venueKey(provider), venueName(provider));
        if (testnet && provider !== "cctp") return { pending: [pending], result: Promise.resolve([failedRow(pending, "not_on_network", "unavailable")]) };
        return { pending: [pending], result: ask().catch((error: unknown) => bridgeFailure(pending, error)) };
      };
      const list: RaceAttempt[] = [];
      if (!wantGas) {
        list.push(
          attempt("cctp", async () => {
            const estimate = await deps.bridges.estimate({ network: context, client, from: wallet, destination: chain, recipient, amount: formatUnits(amount, USDC_DECIMALS) });
            const received = amount > estimate.maxFee ? amount - estimate.maxFee : ZERO;
            return [bridgeRow("cctp", received, output, { minReceived: received, amountIn: amount })];
          }),
          attempt("across", async () => {
            const quote = await acrossQuote({ originChainId: context.chainId, destinationChainId: chain.chainId, inputToken: context.addresses.usdc, outputToken: chain.usdc, amount, depositor: wallet, recipient });
            return [bridgeRow("across", quote.outputAmount, output, { minReceived: quote.minOutputAmount, fillSeconds: quote.fillSeconds, amountIn: amount })];
          }),
          attempt("relay", async () => {
            const quote = await relayQuote({ originChainId: context.chainId, destinationChainId: chain.chainId, originCurrency: context.addresses.usdc, destinationCurrency: chain.usdc, amount, user: wallet, recipient });
            return [bridgeRow("relay", quote.outputAmount, output, { minReceived: quote.outputAmount, fillSeconds: quote.fillSeconds, amountIn: amount })];
          }),
          attempt("debridge", async () => {
            const quote = await debridgeQuote({ srcChainId: context.chainId, srcToken: DEBRIDGE_NATIVE, amount: rescale(amount, USDC_DECIMALS, USDC_NATIVE_DECIMALS), dstChainId: chain.chainId, dstToken: chain.usdc, recipient, authority: wallet });
            // Its flat fee is paid on top, in Arc's native USDC (18 decimals), so it counts against what arrives.
            return [bridgeRow("debridge", quote.outputAmount, output, { minReceived: quote.outputAmount, fillSeconds: quote.fillSeconds, extraCost: rescale(quote.fixFee, USDC_NATIVE_DECIMALS, USDC_DECIMALS), amountIn: amount })];
          }),
        );
      } else {
        list.push(
          attempt("gaszip", async () => {
            const quote = await gasZipQuote({ originChainId: context.chainId, destinationChainId: chain.chainId, amountWei: rescale(amount, USDC_DECIMALS, USDC_NATIVE_DECIMALS), from: wallet, to: recipient });
            return [bridgeRow("gaszip", quote.outputAmount, output, { minReceived: quote.outputAmount, fillSeconds: quote.etaSeconds, feeUsd: quote.outputUsd !== null ? Math.max(Number(formatUnits(amount, USDC_DECIMALS)) - quote.outputUsd, 0) : null })];
          }),
        );
      }
      list.push(
        attempt("lifi", async () => {
          const quote = await lifiQuote({ fromChainId: context.chainId, toChainId: chain.chainId, fromToken: context.addresses.usdc, toToken: wantGas ? LIFI_NATIVE : chain.usdc, amount, from: wallet, to: recipient, slippageBps });
          return [bridgeRow("lifi", quote.outputAmount, output, { minReceived: quote.minOutputAmount, fillSeconds: quote.fillSeconds, amountIn: wantGas ? undefined : amount, via: quote.tool || null, ...(wantGas ? { feeUsd: quote.feeUsd } : {}) })];
        }),
        attempt("socket", async () => {
          const route = await socketQuote({ originChainId: context.chainId, destinationChainId: chain.chainId, inputToken: context.addresses.usdc, outputToken: outToken, amount, user: wallet, receiver: recipient, slippageBps });
          return [bridgeRow("socket", route.outputAmount, output, { minReceived: route.minOutputAmount, fillSeconds: route.etaSeconds, amountIn: wantGas ? undefined : amount, via: route.via, feeBps: route.fee.bps, quoteId: route.quoteId })];
        }),
      );
      return raceRoutes("bridge", list, { ...options, ask: { amount: amount.toString(), symbol: "USDC", decimals: USDC_DECIMALS, to: output.symbol, chain: CHAIN_NAMES[chain.id] ?? chain.id } });
    },

    /** Every place `asset` can earn, ranked by what a year brings on `amount`. */
    async yield(user: SessionUser | undefined, request: Extract<RouteRaceRequest, { kind: "yield" }>, options: RaceOptions = {}): Promise<AsyncGenerator<RouteRace>> {
      if (!deps.yieldOptions) throw new RaceInputError("not_available");
      const network: NetworkId = user?.activeNetwork ?? "mainnet";
      const { network: context, client } = clientsOf(network);
      const token = await tokenOf(context, client, request.asset);
      const amount = request.amount ? amountOf(request.amount, token.decimals) : null;
      const meta: TokenMeta = { symbol: token.symbol, decimals: token.decimals };
      const pending = [checkingRow("aave", "provider:aave", "Aave"), checkingRow("morpho", "provider:morpho", "Morpho"), checkingRow("merkl", "provider:merkl", "Merkl")];
      const result = deps.yieldOptions(user, token.symbol, request.amount ?? null).then((view) => view.options.map((option) => routeFromYield(option, meta, amount)));
      return raceRoutes("yield", [{ pending, result }], { ...options, ask: { amount: (amount ?? ZERO).toString(), symbol: token.symbol, decimals: token.decimals, to: token.symbol } });
    },
  };
}

export type RouteRacer = ReturnType<typeof createRouteRacer>;
