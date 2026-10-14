// Relay (api.relay.link, keyless). A quote returns steps: transactions for the wallet to send (on Arc: approve +
// `depositErc20(depositor, token, amount, id)` into Relay's depository) or, with `usePermit`, an EIP-712 signature
// (USDC's EIP-3009 ReceiveWithAuthorization to Relay's approval proxy) that Relay itself executes, so bringing USDC
// from Base to Arc needs no ETH on Base. Checked live 2026-10-02 (Arc → Base deposit steps; Base → Arc permit step,
// 50 USDC → 49.964). The request id binds the destination and recipient on Relay's side; status by request id.
import { decodeFunctionData, erc20Abi, parseAbi, type Address, type Hex } from "viem";

import { BridgeProviderError, type BridgeCall } from "./across";

const API = "https://api.relay.link";
const TIMEOUT_MS = 8_000;
const NO_VALUE = 0n;
const APPROVE_AND_DEPOSIT = 2;

const depositoryAbi = parseAbi(["function depositErc20(address depositor, address token, uint256 amount, bytes32 id)"]);

export type RelayQuoteInput = {
  originChainId: number;
  destinationChainId: number;
  originCurrency: Address;
  destinationCurrency: Address;
  amount: bigint;
  user: Address;
  recipient: Address;
  /** Gasless on the origin: the wallet signs a permit, Relay sends the transaction. */
  usePermit?: boolean;
};

export type RelayPermit = {
  /** EIP-712 typed data to sign (domain, types, primaryType, message). */
  typedData: { domain: Record<string, unknown>; types: Record<string, { name: string; type: string }[]>; primaryType: string; message: Record<string, unknown> };
  post: { endpoint: string; method: string; body: Record<string, unknown> };
};

export type RelayQuote = {
  requestId: Hex;
  outputAmount: bigint;
  fillSeconds: number | null;
  /** Transactions for the wallet (Arc → elsewhere), in order. */
  calls: BridgeCall[];
  /** The signature step instead (usePermit). */
  permit: RelayPermit | null;
};

type Step = { id: string; kind: "transaction" | "signature"; requestId?: Hex; items?: { data: Record<string, unknown> }[] };

async function call(path: string, init?: RequestInit) {
  try {
    const response = await fetch(`${API}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { ok: response.ok, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    throw new BridgeProviderError("Relay", "timeout", "Relay did not answer in time");
  }
}

export async function relayQuote(input: RelayQuoteInput): Promise<RelayQuote> {
  const { ok, body } = await call("/quote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user: input.user,
      recipient: input.recipient,
      originChainId: input.originChainId,
      destinationChainId: input.destinationChainId,
      originCurrency: input.originCurrency,
      destinationCurrency: input.destinationCurrency,
      amount: input.amount.toString(),
      tradeType: "EXACT_INPUT",
      ...(input.usePermit ? { usePermit: true } : {}),
    }),
  });
  const steps = (body.steps as Step[] | undefined) ?? [];
  const details = body.details as { currencyOut?: { amount?: string }; timeEstimate?: number } | undefined;
  const out = details?.currencyOut?.amount;
  if (!ok || !out || steps.length === 0) throw new BridgeProviderError("Relay", "no_quote", String(body.message ?? "no quote"));
  const requestId = steps.find((step) => step.requestId)?.requestId;
  if (!requestId) throw new BridgeProviderError("Relay", "no_quote", "no request id");
  const calls: BridgeCall[] = [];
  let permit: RelayPermit | null = null;
  for (const step of steps) {
    for (const item of step.items ?? []) {
      if (step.kind === "transaction") {
        const data = item.data as { to?: Address; data?: Hex; value?: string; chainId?: number };
        if (!data.to || !data.data || data.chainId !== input.originChainId) throw new BridgeProviderError("Relay", "refused", "a step on another chain");
        calls.push({ to: data.to, data: data.data, value: BigInt(data.value ?? "0") });
      } else {
        const data = item.data as { sign?: { signatureKind?: string; domain: Record<string, unknown>; types: RelayPermit["typedData"]["types"]; primaryType: string; value: Record<string, unknown> }; post?: RelayPermit["post"] };
        if (data.sign?.signatureKind !== "eip712" || !data.post) throw new BridgeProviderError("Relay", "refused", "an unexpected signature step");
        permit = { typedData: { domain: data.sign.domain, types: data.sign.types, primaryType: data.sign.primaryType, message: data.sign.value }, post: data.post };
      }
    }
  }
  return { requestId, outputAmount: BigInt(out), fillSeconds: details?.timeEstimate ?? null, calls, permit };
}

export type RelayCheckReason = "wrong_shape" | "wrong_spender" | "wrong_depositor" | "wrong_token" | "wrong_amount" | "native_value" | "unknown_depository";

/**
 * Arc → elsewhere: exactly an approval of `amount` to the depository and `depositErc20(wallet, token, amount, id)`
 * on it, no native value; the depository must be one of the contracts Relay lists for the chain. The deposit's `id`
 * is Relay's order hash (not the request id, seen live 10-02): the destination and recipient it stands for are bound
 * on Relay's side, as quoted to us, and the fill is followed by request id.
 */
export function checkRelayCalls(
  calls: readonly BridgeCall[],
  expected: { depositories: readonly Address[]; depositor: Address; token: Address; amount: bigint },
): { ok: true } | { ok: false; reason: RelayCheckReason } {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const [approve, deposit] = calls;
  if (calls.length !== APPROVE_AND_DEPOSIT || !approve || !deposit) return { ok: false, reason: "wrong_shape" };
  if (approve.value !== NO_VALUE || deposit.value !== NO_VALUE) return { ok: false, reason: "native_value" };
  if (!expected.depositories.some((address) => same(address, deposit.to))) return { ok: false, reason: "unknown_depository" };
  const approval = decodeFunctionData({ abi: erc20Abi, data: approve.data });
  if (approval.functionName !== "approve" || !same(approve.to, expected.token)) return { ok: false, reason: "wrong_shape" };
  if (!same(approval.args[0] as Address, deposit.to)) return { ok: false, reason: "wrong_spender" };
  if (approval.args[1] !== expected.amount) return { ok: false, reason: "wrong_amount" };
  const decoded = decodeFunctionData({ abi: depositoryAbi, data: deposit.data });
  const [depositor, token, amount] = decoded.args;
  if (!same(depositor, expected.depositor)) return { ok: false, reason: "wrong_depositor" };
  if (!same(token, expected.token)) return { ok: false, reason: "wrong_token" };
  if (amount !== expected.amount) return { ok: false, reason: "wrong_amount" };
  return { ok: true };
}

/**
 * The permit Relay asked for must be USDC's ReceiveWithAuthorization from the wallet, for exactly the amount, to
 * Relay's approval proxy, on the origin chain's USDC contract; nothing else is signed.
 */
export function checkRelayPermit(permit: RelayPermit, expected: { chainId: number; token: Address; from: Address; amount: bigint; approvalProxy: Address }): boolean {
  const same = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
  const { domain, primaryType, message } = permit.typedData;
  return (
    primaryType === "ReceiveWithAuthorization" &&
    Number(domain.chainId) === expected.chainId &&
    same(domain.verifyingContract, expected.token) &&
    same(message.from, expected.from) &&
    same(message.to, expected.approvalProxy) &&
    BigInt(String(message.value)) === expected.amount
  );
}

/** Uniswap's Permit2, at the same address on every chain. */
export const PERMIT2: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

/**
 * For tokens other than USDC Relay asks for a Permit2 batch-witness transfer (seen live 10-02 for EURC and WETH from
 * Base): it must be Permit2's own domain on the origin chain, permit exactly one token for exactly the amount, and
 * name one of Relay's contracts as the spender; the witness (Relay's calls) is bound to its request on Relay's side.
 */
export function checkRelayPermit2(permit: RelayPermit, expected: { chainId: number; token: Address; amount: bigint; spenders: readonly Address[] }): boolean {
  const same = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
  const { domain, primaryType, message } = permit.typedData;
  const permitted = message.permitted as { token?: string; amount?: string }[] | undefined;
  return (
    primaryType === "PermitBatchWitnessTransferFrom" &&
    Number(domain.chainId) === expected.chainId &&
    same(domain.verifyingContract, PERMIT2) &&
    Array.isArray(permitted) &&
    permitted.length === 1 &&
    same(permitted[0]!.token, expected.token) &&
    BigInt(String(permitted[0]!.amount)) === expected.amount &&
    expected.spenders.some((spender) => same(message.spender, spender))
  );
}

/**
 * Bring to Arc, the first of two steps: the one transaction Relay asks for before a Permit2 transfer when the token is
 * not yet approved to Permit2 at that address — exactly `token.approve(Permit2, ≥ amount)`, no native value. Permit2 then
 * moves nothing without the person's own signature for each transfer (the second step).
 */
export function checkPermit2Approval(calls: readonly BridgeCall[], expected: { token: Address; amount: bigint }): boolean {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const [approve] = calls;
  if (calls.length !== 1 || !approve || approve.value !== NO_VALUE || !same(approve.to, expected.token)) return false;
  const decoded = (() => {
    try {
      return decodeFunctionData({ abi: erc20Abi, data: approve.data });
    } catch {
      return undefined;
    }
  })();
  return decoded?.functionName === "approve" && same(decoded.args[0] as Address, PERMIT2) && (decoded.args[1] as bigint) >= expected.amount;
}

/** Hands the signed permit to Relay, which executes it on the origin chain. */
export async function submitRelayPermit(permit: RelayPermit, signature: Hex): Promise<void> {
  const { ok, body } = await call(`${permit.post.endpoint}?signature=${signature}`, {
    method: permit.post.method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(permit.post.body),
  });
  if (!ok) throw new BridgeProviderError("Relay", "refused", String(body.message ?? "permit refused"));
}

export type RelayStatus = { status: "waiting" | "pending" | "success" | "failure" | "refund" | "unknown"; destinationTxHash: Hex | null; originTxHash: Hex | null };

export async function relayStatus(requestId: Hex): Promise<RelayStatus> {
  const { body } = await call(`/intents/status/v3?requestId=${requestId}`);
  const status = String(body.status ?? "unknown");
  const known = ["waiting", "pending", "success", "failure", "refund"] as const;
  const hashes = (key: string) => ((body[key] as Hex[] | undefined) ?? [])[0] ?? null;
  return { status: (known as readonly string[]).includes(status) ? (status as RelayStatus["status"]) : "unknown", destinationTxHash: hashes("txHashes"), originTxHash: hashes("inTxHashes") };
}

/** Relay's own contracts on a chain (its `chains` api): the approval proxy and routers deposits may go to. */
export async function relayContracts(chainId: number): Promise<Address[]> {
  const { body } = await call("/chains");
  const chain = ((body.chains as { id: number; contracts?: Record<string, unknown>; protocol?: { v2?: { depository?: string } } }[] | undefined) ?? []).find((entry) => entry.id === chainId);
  const flat = Object.values(chain?.contracts ?? {}).flatMap((value) => (typeof value === "string" ? [value] : typeof value === "object" && value ? Object.values(value as Record<string, string>) : []));
  // The v2 protocol's depository (where Arc deposits go, 0x4cD0…BC31 on 10-02) is listed apart from `contracts`.
  if (chain?.protocol?.v2?.depository) flat.push(chain.protocol.v2.depository);
  return flat.filter((value): value is Address => /^0x[0-9a-fA-F]{40}$/.test(value));
}
