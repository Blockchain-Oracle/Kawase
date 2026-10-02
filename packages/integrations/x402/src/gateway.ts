// The agent wallet's Gateway balance (cards/marketplace.md "How it pays"): one deposit (approve + deposit, sent by
// the agent wallet itself), off-chain nanopayments against it, and a same-chain withdrawal straight to the person's
// wallet (a burn intent the agent wallet signs, Circle's attestation, then `gatewayMint`). Addresses come from
// `@circle-fin/x402-batching`'s CHAIN_CONFIGS (`arc`, `arcTestnet`).
import { CHAIN_CONFIGS } from "@circle-fin/x402-batching/client";
import { encodeFunctionData, erc20Abi, formatUnits, maxUint256, pad, parseUnits, zeroAddress, type Address, type Hex } from "viem";

import { X402_REQUEST_TIMEOUT_MS } from "@kawase/config";
import type { NetworkContext } from "@kawase/networks";

export type ContractCall = { to: Address; data: Hex };

const USDC_DECIMALS = 6;
const GATEWAY_API = { mainnet: "https://gateway-api.circle.com/v1", testnet: "https://gateway-api-testnet.circle.com/v1" } as const;
const TRANSFER_SPEC_VERSION = 1;
const WORD_BYTES = 32;

const GATEWAY_WALLET_ABI = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const GATEWAY_MINTER_ABI = [
  {
    name: "gatewayMint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "attestationPayload", type: "bytes" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export const gatewayConfig = (network: NetworkContext) => (network.isRealMoney ? CHAIN_CONFIGS.arc : CHAIN_CONFIGS.arcTestnet);

export type GatewayBalance = { available: bigint; withdrawing: bigint; withdrawable: bigint };

/** The depositor's Gateway balance on Arc (Circle's Gateway API). */
export async function gatewayBalance(network: NetworkContext, depositor: Address, fetchImpl: typeof fetch = fetch): Promise<GatewayBalance> {
  const config = gatewayConfig(network);
  const response = await fetchImpl(`${GATEWAY_API[network.id]}/balances`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "USDC", sources: [{ depositor, domain: config.domain }] }),
    signal: AbortSignal.timeout(X402_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`gateway balances answered ${response.status}`);
  const data = (await response.json()) as { balances?: { balance?: string; withdrawing?: string; withdrawable?: string }[] };
  const [entry] = data.balances ?? [];
  const units = (value: string | undefined) => parseUnits(value ?? "0", USDC_DECIMALS);
  return { available: units(entry?.balance), withdrawing: units(entry?.withdrawing), withdrawable: units(entry?.withdrawable) };
}

/** `usdc.approve(gatewayWallet, amount)` then `gatewayWallet.deposit(usdc, amount)`, both sent by the depositor. */
export function encodeGatewayDeposit(network: NetworkContext, amount: bigint): { approve: ContractCall; deposit: ContractCall } {
  const config = gatewayConfig(network);
  return {
    approve: { to: config.usdc, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [config.gatewayWallet, amount] }) },
    deposit: { to: config.gatewayWallet, data: encodeFunctionData({ abi: GATEWAY_WALLET_ABI, functionName: "deposit", args: [config.usdc, amount] }) },
  };
}

/** `usdc.transfer(to, amount)`, sent by the agent wallet. */
export function encodeUsdcTransfer(network: NetworkContext, to: Address, amount: bigint): ContractCall {
  return { to: network.addresses.usdc, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] }) };
}

const word = (address: Address) => pad(address.toLowerCase() as Hex, { size: WORD_BYTES });

/** The burn intent for a same-chain withdrawal to `recipient`, as the EIP-712 payload the depositor signs. */
export function withdrawIntent(network: NetworkContext, input: { depositor: Address; recipient: Address; value: bigint; maxFee: bigint; salt: Hex }) {
  const config = gatewayConfig(network);
  const burnIntent = {
    maxBlockHeight: maxUint256,
    maxFee: input.maxFee,
    spec: {
      version: TRANSFER_SPEC_VERSION,
      sourceDomain: config.domain,
      destinationDomain: config.domain,
      sourceContract: word(config.gatewayWallet),
      destinationContract: word(config.gatewayMinter),
      sourceToken: word(config.usdc),
      destinationToken: word(config.usdc),
      sourceDepositor: word(input.depositor),
      destinationRecipient: word(input.recipient),
      sourceSigner: word(input.depositor),
      destinationCaller: word(zeroAddress),
      value: input.value,
      salt: input.salt,
      hookData: "0x" as Hex,
    },
  };
  const typedData = {
    domain: { name: "GatewayWallet", version: "1" },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
      ],
      TransferSpec: [
        { name: "version", type: "uint32" },
        { name: "sourceDomain", type: "uint32" },
        { name: "destinationDomain", type: "uint32" },
        { name: "sourceContract", type: "bytes32" },
        { name: "destinationContract", type: "bytes32" },
        { name: "sourceToken", type: "bytes32" },
        { name: "destinationToken", type: "bytes32" },
        { name: "sourceDepositor", type: "bytes32" },
        { name: "destinationRecipient", type: "bytes32" },
        { name: "sourceSigner", type: "bytes32" },
        { name: "destinationCaller", type: "bytes32" },
        { name: "value", type: "uint256" },
        { name: "salt", type: "bytes32" },
        { name: "hookData", type: "bytes" },
      ],
      BurnIntent: [
        { name: "maxBlockHeight", type: "uint256" },
        { name: "maxFee", type: "uint256" },
        { name: "spec", type: "TransferSpec" },
      ],
    },
    primaryType: "BurnIntent",
    message: burnIntent,
  };
  return { burnIntent, typedData };
}

const bigintsAsStrings = (_: string, value: unknown) => (typeof value === "bigint" ? value.toString() : value);

/** Circle's attestation for a signed burn intent, and the mint call that pays it out on Arc. */
export async function gatewayTransfer(
  network: NetworkContext,
  burnIntent: unknown,
  signature: Hex,
  fetchImpl: typeof fetch = fetch,
): Promise<ContractCall> {
  const response = await fetchImpl(`${GATEWAY_API[network.id]}/transfer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify([{ burnIntent, signature }], bigintsAsStrings),
    signal: AbortSignal.timeout(X402_REQUEST_TIMEOUT_MS),
  });
  const result = (await response.json()) as { attestation?: Hex; signature?: Hex; message?: string; error?: string; success?: boolean };
  if (!response.ok || result.success === false || !result.attestation || !result.signature) {
    throw new Error(`gateway transfer refused: ${result.message ?? result.error ?? response.status}`);
  }
  const config = gatewayConfig(network);
  return { to: config.gatewayMinter, data: encodeFunctionData({ abi: GATEWAY_MINTER_ABI, functionName: "gatewayMint", args: [result.attestation, result.signature] }) };
}

export const formatUsdc = (amount: bigint) => formatUnits(amount, USDC_DECIMALS);
