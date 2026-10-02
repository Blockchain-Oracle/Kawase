// Paying one x402 call (protocol v2, cards/marketplace.md "How it pays"). The seller is asked once without payment;
// its 402 names what it accepts. Kawase picks an option on this network in USDC (Gateway nanopayment when the agent
// wallet has a Gateway balance, else plain EIP-3009), the caller checks it against the person's caps, and only then
// is it signed — by the agent wallet, through `@circle-fin/x402-batching`'s CompositeEvmScheme — and sent once.
// Whatever comes back is untrusted data: only text or JSON, only so many bytes.
import { BatchEvmScheme, CompositeEvmScheme } from "@circle-fin/x402-batching/client";
import { decodePaymentRequiredHeader, decodePaymentResponseHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import type { Address, Hex } from "viem";

import { X402_REQUEST_TIMEOUT_MS, X402_RESPONSE_MAX_BYTES } from "@kawase/config";
import type { NetworkContext } from "@kawase/networks";

/** One entry of a 402's `accepts` (v2). */
export type PaymentOption = {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
};

export type PaymentRequired = { x402Version: number; resource?: unknown; accepts: PaymentOption[] };

/** What signs for the agent wallet: an address and EIP-712 signing (a Circle developer-controlled wallet). */
export type AgentSigner = {
  address: Address;
  signTypedData(input: { domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> }): Promise<Hex>;
};

const GATEWAY_BATCHING_NAME = "GatewayWalletBatched";
const HTTP_PAYMENT_REQUIRED = 402;
const TEXTUAL = /^(application\/(json|[a-z.+-]*\+json|xml|x-ndjson)|text\/)/i;

export const isGatewayOption = (option: PaymentOption) => option.extra?.name === GATEWAY_BATCHING_NAME;

export type Call = { url: string; method: string; body?: string | undefined };

export type Probe =
  | { kind: "payment_required"; required: PaymentRequired }
  /** The seller answered without asking for money (nothing to pay). */
  | { kind: "free"; answer: Answer }
  | { kind: "error"; status: number };

export type Answer = { status: number; contentType: string | null; text: string; truncated: boolean };

const init = (call: Call, headers: Record<string, string> = {}): RequestInit => ({
  method: call.method,
  headers: { accept: "application/json, text/*;q=0.9", ...(call.body ? { "content-type": "application/json" } : {}), ...headers },
  ...(call.body ? { body: call.body } : {}),
  redirect: "error",
  signal: AbortSignal.timeout(X402_REQUEST_TIMEOUT_MS),
});

/** The body as text, never more than the cap; anything that is not text or JSON is refused unread. */
async function readAnswer(response: Response): Promise<Answer> {
  const contentType = response.headers.get("content-type");
  if (contentType && !TEXTUAL.test(contentType)) {
    await response.body?.cancel();
    return { status: response.status, contentType, text: "", truncated: true };
  }
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
      if (size >= X402_RESPONSE_MAX_BYTES) {
        truncated = true;
        await reader.cancel();
        break;
      }
    }
  }
  const bytes = Buffer.concat(chunks).subarray(0, X402_RESPONSE_MAX_BYTES);
  return { status: response.status, contentType, text: bytes.toString("utf8"), truncated };
}

/** Asks once without paying. */
export async function probe(call: Call, fetchImpl: typeof fetch = fetch): Promise<Probe> {
  const response = await fetchImpl(call.url, init(call));
  if (response.status !== HTTP_PAYMENT_REQUIRED) {
    if (response.ok) return { kind: "free", answer: await readAnswer(response) };
    await response.body?.cancel();
    return { kind: "error", status: response.status };
  }
  const header = response.headers.get("payment-required");
  await response.body?.cancel();
  if (!header) return { kind: "error", status: response.status };
  const required = decodePaymentRequiredHeader(header) as unknown as PaymentRequired;
  return { kind: "payment_required", required };
}

/** The options this network can pay: `exact`, USDC on this chain. */
export function optionsHere(required: PaymentRequired, network: NetworkContext) {
  const here = required.accepts.filter(
    (option) =>
      option.scheme === "exact" &&
      option.network === `eip155:${network.chainId}` &&
      option.asset.toLowerCase() === network.addresses.usdc.toLowerCase(),
  );
  return { gateway: here.find(isGatewayOption), eip3009: here.find((option) => !isGatewayOption(option)) };
}

export type Paid = {
  answer: Answer;
  /** The seller's settlement (a Gateway transfer id or a transaction hash), when it said. */
  settlement: string | null;
  /** The EIP-3009 nonce that was signed. */
  nonce: string | null;
};

/** Signs the chosen option once and sends the call with it. Never retried: a lost answer is reconciled, not re-signed. */
export async function pay(
  call: Call,
  required: PaymentRequired,
  option: PaymentOption,
  signer: AgentSigner,
  fetchImpl: typeof fetch = fetch,
): Promise<Paid> {
  const scheme = new CompositeEvmScheme(new BatchEvmScheme(signer as never), new ExactEvmScheme(signer as never));
  const payload = await scheme.createPaymentPayload(required.x402Version, option);
  const header = encodePaymentSignatureHeader({
    ...payload,
    resource: required.resource,
    accepted: option,
  } as never);
  const response = await fetchImpl(call.url, init(call, { "payment-signature": header }));
  const settlementHeader = response.headers.get("payment-response");
  let settlement: string | null = null;
  if (settlementHeader) {
    try {
      settlement = (decodePaymentResponseHeader(settlementHeader) as { transaction?: string }).transaction || null;
    } catch {
      settlement = null;
    }
  }
  const authorization = (payload.payload as { authorization?: { nonce?: string } }).authorization;
  return { answer: await readAnswer(response), settlement, nonce: authorization?.nonce ?? null };
}
