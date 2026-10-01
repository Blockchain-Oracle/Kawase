// Bridging USDC out of Arc through Circle App Kit (CCTP V2 with Circle's forwarder), signed by the user's own
// wallet — the same shape as swaps (spike 3 finding 7, re-done for the D33 wallet). The kit estimates and builds
// approve + burn; a capture strategy takes the calls and stops it; Kawase checks them and the wallet sends them to
// itself as one EIP-7702 batch (one Face ID). Circle attests the burn and its forwarder mints on the destination,
// paid out of the amount, so the destination needs no wallet set-up and no gas. Kawase follows the attestation and
// the forward through Circle's IRIS api and checks the mint on the destination chain.
import { AppKit } from "@circle-fin/app-kit";
import {
  Arbitrum,
  ArbitrumSepolia,
  Avalanche,
  AvalancheFuji,
  Base,
  BaseSepolia,
  Ethereum,
  EthereumSepolia,
  Optimism,
  OptimismSepolia,
  Polygon,
  PolygonAmoy,
} from "@circle-fin/app-kit/chains";
import type { SigningStrategy } from "@circle-fin/adapter-viem-v2/next";
import { createPublicClient, decodeEventLog, decodeFunctionData, erc20Abi, hexToString, http, pad, parseAbi, type Address, type Hex, type PublicClient } from "viem";

import type { NetworkContext } from "@kawase/networks";

import { adapterFor, capturedCalls, kitChain, withRouteRetry, type SwapCall } from "./swap";

export type BridgeDestinationId = "base" | "ethereum" | "arbitrum" | "optimism" | "polygon" | "avalanche";

export type BridgeDestination = {
  id: BridgeDestinationId;
  /** App Kit's chain name ("Base_Sepolia"). */
  kitChain: string;
  chainId: number;
  /** CCTP domain. */
  domain: number;
  usdc: Address;
  rpcUrl: string;
  explorerTx: string;
};

type KitChainDef = { chain: string; chainId: number; usdcAddress: string; rpcEndpoints: readonly string[]; explorerUrl: string; cctp?: { domain: number } };

const toDestination = (id: BridgeDestinationId, chain: KitChainDef): BridgeDestination => ({
  id,
  kitChain: chain.chain,
  chainId: chain.chainId,
  domain: chain.cctp?.domain ?? -1,
  usdc: chain.usdcAddress as Address,
  rpcUrl: chain.rpcEndpoints[0] ?? "",
  explorerTx: chain.explorerUrl,
});

const DESTINATIONS: Record<"mainnet" | "testnet", Record<BridgeDestinationId, KitChainDef>> = {
  mainnet: { base: Base, ethereum: Ethereum, arbitrum: Arbitrum, optimism: Optimism, polygon: Polygon, avalanche: Avalanche } as never,
  testnet: {
    base: BaseSepolia,
    ethereum: EthereumSepolia,
    arbitrum: ArbitrumSepolia,
    optimism: OptimismSepolia,
    polygon: PolygonAmoy,
    avalanche: AvalancheFuji,
  } as never,
};

/** Where USDC can go from this Arc network, in the order Kawase offers them. */
export function bridgeDestinations(network: NetworkContext): BridgeDestination[] {
  const table = DESTINATIONS[network.isRealMoney ? "mainnet" : "testnet"];
  return (Object.keys(table) as BridgeDestinationId[]).map((id) => toDestination(id, table[id]));
}

export function bridgeDestination(network: NetworkContext, id: BridgeDestinationId): BridgeDestination {
  const found = bridgeDestinations(network).find((entry) => entry.id === id);
  if (!found) throw new Error(`no bridge destination ${id}`);
  return found;
}

/** App Kit's bridge contract on Arc: the only target and spender a bridge's calls may name. */
export function bridgeContract(network: NetworkContext): Address {
  const bridge = (kitChain(network) as { kitContracts?: { bridge?: string } }).kitContracts?.bridge;
  if (!bridge) throw new Error(`App Kit has no bridge contract on ${network.appKitChain}`);
  return bridge as Address;
}

export type BridgeInput = {
  network: NetworkContext;
  client: PublicClient;
  apiKey: string;
  from: Address;
  destination: BridgeDestination;
  recipient: Address;
  /** Decimal USDC, e.g. "5". */
  amount: string;
};

export type BridgeEstimate = {
  /** USDC base units the route may take on the way (the forwarder's fee and CCTP's fast fee), at most. */
  maxFee: bigint;
  fees: { type: string; amount: string }[];
};

const NEVER_SIGN: SigningStrategy = {
  manifest: { name: "kawase-quote", supportedPayloadFamilies: ["evm-calls"], broadcasts: true, atomicBatch: true },
  execute: () => Promise.reject(new Error("kawase: an estimate never signs")),
};

const USDC_DECIMALS = 6;
const toBaseUnits = (decimal: string) => {
  const [whole = "0", fraction = ""] = decimal.split(".");
  return BigInt(whole + fraction.padEnd(USDC_DECIMALS, "0").slice(0, USDC_DECIMALS));
};

const params = (input: BridgeInput, adapter: unknown) =>
  ({
    from: { adapter, chain: input.network.appKitChain },
    to: { recipientAddress: input.recipient, chain: input.destination.kitChain, useForwarder: true },
    amount: input.amount,
    ...(input.apiKey ? { config: { apiKey: input.apiKey } } : {}),
  }) as never;

/** The route's fees before anything is approved (its gas simulation fails without an allowance; that is expected). */
export async function estimateBridge(input: BridgeInput): Promise<BridgeEstimate> {
  const kit = new AppKit();
  const estimate = (await withRouteRetry(() => kit.estimateBridge(params(input, adapterFor(input, NEVER_SIGN))))) as unknown as {
    fees?: { type: string; amount: string }[];
  };
  const fees = estimate.fees ?? [];
  return { maxFee: fees.reduce((sum, fee) => sum + toBaseUnits(fee.amount), ZERO), fees };
}

const ZERO = 0n;

/** The exact calls for one bridge: App Kit's approve + burn, captured before anything is signed. */
export const prepareBridge = (input: BridgeInput): Promise<SwapCall[]> =>
  withRouteRetry(() => capturedCalls(input, (adapter) => new AppKit().bridge(params(input, adapter))));

const APPROVE_ABI = parseAbi([
  "function approve(address spender, uint256 amount)",
  "function increaseAllowance(address spender, uint256 increment)",
]);

/** App Kit's bridge contract (from @circle-fin/adapter-viem-v2's custom bridge ABI). */
const BRIDGE_ABI = parseAbi([
  "struct BridgeParams { uint256 amount; uint256 maxFee; uint256 fee; bytes32 mintRecipient; bytes32 destinationCaller; address burnToken; address feeRecipient; uint32 destinationDomain; uint32 minFinalityThreshold; }",
  "function bridgeWithPreapproval(BridgeParams bridgeParams)",
  "function bridgeWithPreapprovalAndHook(BridgeParams bridgeParams, bytes hookData)",
]);

/** The forwarder hook App Kit attaches ("cctp-forward", right-padded): Circle mints on the destination. */
const FORWARD_HOOK = "cctp-forward";
const ZERO_BYTES32 = pad("0x", { size: 32 });

export type BridgeCallCheck = { ok: true; maxFee: bigint } | { ok: false; reason: string };

/**
 * The calls may do only this: let App Kit's bridge contract take exactly `amount` USDC, then burn exactly `amount`
 * for `recipient` on the destination's CCTP domain, with no developer fee, any caller on the destination, a fee cap
 * no higher than the one shown, and either no hook or the forwarder's. Anything else is refused before the wallet
 * is asked; the mint is checked on the destination afterwards.
 */
export function checkBridgeCalls(
  network: NetworkContext,
  calls: readonly SwapCall[],
  expected: { usdc: Address; amount: bigint; recipient: Address; domain: number; maxFee: bigint },
): BridgeCallCheck {
  const bridge = bridgeContract(network).toLowerCase();
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if (calls.length === 0 || calls.length > MAX_CALLS) return { ok: false, reason: `expected 1–2 calls, got ${calls.length}` };
  if (calls.some((call) => call.value !== ZERO)) return { ok: false, reason: "a call carries native value" };
  const burn = calls[calls.length - 1]!;
  if (!same(burn.to, bridge)) return { ok: false, reason: "the burn is not to App Kit's bridge contract" };
  if (calls.length === MAX_CALLS) {
    const approve = calls[0]!;
    if (!same(approve.to, expected.usdc)) return { ok: false, reason: "the approval is for another token" };
    let decoded;
    try {
      decoded = decodeFunctionData({ abi: APPROVE_ABI, data: approve.data });
    } catch {
      return { ok: false, reason: "the first call is not an approval" };
    }
    const [spender, value] = decoded.args as readonly [Address, bigint];
    if (!same(spender, bridge)) return { ok: false, reason: "the approval names another spender" };
    if (value !== expected.amount) return { ok: false, reason: "the approval is not exactly the amount" };
  }
  let decoded;
  try {
    decoded = decodeFunctionData({ abi: BRIDGE_ABI, data: burn.data });
  } catch {
    return { ok: false, reason: "the burn is not App Kit's bridge call" };
  }
  const [p, hook] = decoded.args as readonly [
    { amount: bigint; maxFee: bigint; fee: bigint; mintRecipient: Hex; destinationCaller: Hex; burnToken: Address; destinationDomain: number },
    Hex | undefined,
  ];
  if (p.amount !== expected.amount) return { ok: false, reason: "the burn is not exactly the amount" };
  if (!same(p.burnToken, expected.usdc)) return { ok: false, reason: "the burn is for another token" };
  if (!same(p.mintRecipient, pad(expected.recipient, { size: 32 }))) return { ok: false, reason: "the mint goes to someone else" };
  if (p.destinationDomain !== expected.domain) return { ok: false, reason: "the mint is on another chain" };
  if (p.fee !== ZERO) return { ok: false, reason: "the route adds a developer fee" };
  if (!same(p.destinationCaller, ZERO_BYTES32)) return { ok: false, reason: "the mint is reserved for one caller" };
  if (p.maxFee > expected.maxFee) return { ok: false, reason: "above_fee_cap" };
  if (hook !== undefined && hook !== "0x" && hexToString(hook).replace(/\0+$/, "") !== FORWARD_HOOK) return { ok: false, reason: "an unknown hook rides on the burn" };
  return { ok: true, maxFee: p.maxFee };
}

const MAX_CALLS = 2;

const IRIS = { mainnet: "https://iris-api.circle.com", testnet: "https://iris-api-sandbox.circle.com" } as const;

export type BridgeProgress = {
  /** "pending" until Circle has attested the burn, then "complete". */
  attestation: "pending" | "complete";
  /** The forwarder's delivery on the destination. */
  forward: "PENDING" | "SENT" | "CONFIRMED" | "COMPLETE" | "FAILED" | null;
  forwardTxHash: string | null;
  forwardError: string | null;
};

/**
 * The forwarder's mint has landed: IRIS reports CONFIRMED once the mint transaction is confirmed on the destination
 * (and COMPLETE later, or not at all on testnet: a 2026-10-01 bridge stayed CONFIRMED for 5+ minutes after the mint
 * was final). Either way the mint is then checked on the destination itself.
 */
export const forwardDelivered = (progress: BridgeProgress | null) =>
  Boolean(progress?.forwardTxHash) && (progress?.forward === "CONFIRMED" || progress?.forward === "COMPLETE");

/** Where Circle is with one burn: attestation, then the forwarder's mint (IRIS `/v2/messages/{domain}`). */
export async function bridgeProgress(network: NetworkContext, burnTxHash: Hex): Promise<BridgeProgress | null> {
  const base = IRIS[network.isRealMoney ? "mainnet" : "testnet"];
  const response = await fetch(`${base}/v2/messages/${network.cctpDomain}?transactionHash=${burnTxHash}`, { signal: AbortSignal.timeout(IRIS_TIMEOUT_MS) });
  if (response.status === HTTP_NOT_FOUND) return null;
  if (!response.ok) throw new Error(`iris ${response.status}`);
  const body = (await response.json()) as {
    messages?: { status?: string; forwardState?: string | null; forwardTxHash?: string | null; forwardErrorCode?: string | null }[];
  };
  const message = body.messages?.[0];
  if (!message) return null;
  return {
    attestation: message.status === "complete" ? "complete" : "pending",
    forward: (message.forwardState as BridgeProgress["forward"]) ?? null,
    forwardTxHash: message.forwardTxHash ?? null,
    forwardError: message.forwardErrorCode ?? null,
  };
}

const IRIS_TIMEOUT_MS = 8_000;
const HTTP_NOT_FOUND = 404;

/**
 * What the forwarder's mint gave `recipient` on the destination, read from that chain's own receipt: the sum of USDC
 * `Transfer`s to the recipient in the mint transaction. Undefined while the receipt is not there yet.
 */
export async function mintedTo(destination: BridgeDestination, mintTxHash: Hex, recipient: Address): Promise<bigint | undefined> {
  const client = createPublicClient({ transport: http(destination.rpcUrl) });
  const receipt = await client.getTransactionReceipt({ hash: mintTxHash }).catch(() => undefined);
  if (!receipt) return undefined;
  if (receipt.status !== "success") return ZERO;
  let received = ZERO;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== destination.usdc.toLowerCase()) continue;
    try {
      const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
      if (event.eventName === "Transfer" && event.args.to.toLowerCase() === recipient.toLowerCase()) received += event.args.value;
    } catch {
      // Not an ERC-20 Transfer.
    }
  }
  return received;
}
