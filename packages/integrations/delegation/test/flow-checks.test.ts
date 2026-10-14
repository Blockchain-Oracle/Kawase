// M6 for B2's flows: before the phone signs a payout it checks the batch pays exactly the lines on the card (relayed
// through Kawase's relayer, or sent by the wallet itself), and before it signs a gas-free send it checks the EIP-3009
// authorization moves exactly the card's amount of USDC or EURC to the card's recipient. The batches here are built
// by the same code the api uses (relayed-batch.ts, batch.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Address, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { DELEGATION_FRAMEWORK, getNetwork } from "@kawase/networks";
import { SigningRefused, arcStablecoin, checkBatch, checkTransferAuthorization, checkTransferGrant, receiptOf, transferCalls, type ShownGrant } from "@kawase/wallet";

import { buildMarketplaceGrant, buildRelayedBatch, describeGrant, encodeSelfBatch, grantTypedData } from "../src";

const network = getNetwork("testnet");
const wallet = privateKeyToAccount(generatePrivateKey()).address;
const other = privateKeyToAccount(generatePrivateKey()).address;
const relayer = privateKeyToAccount(generatePrivateKey()).address;
const one = privateKeyToAccount(generatePrivateKey()).address;
const two = privateKeyToAccount(generatePrivateKey()).address;
const TEN_MINUTES = 600;
const nowSeconds = () => Math.floor(Date.now() / 1000);
const json = <T>(value: T) => JSON.parse(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v))) as T;
const refused = (run: () => unknown, reason: RegExp) =>
  assert.throws(run, (error: unknown) => error instanceof SigningRefused && reason.test(error.reason), `expected a refusal matching ${reason}`);

const usdc = arcStablecoin("testnet", "USDC")!;
const eurc = arcStablecoin("testnet", "EURC")!;
const lines = [
  { address: one, amount: "10000" },
  { address: two, amount: "20000" },
];
const relayed = (calls: ReturnType<typeof transferCalls>, from: Address = wallet, expiresAt = nowSeconds() + TEN_MINUTES) =>
  json(grantTypedData(network, buildRelayedBatch({ network, wallet: from, relayer, calls: calls.map((call) => ({ ...call, value: 0n })), expiresAt, salt: `0x${"11".repeat(32)}` as Hex })));
const selfSent = (calls: ReturnType<typeof transferCalls>, to: string = wallet, value = "0") => ({ to, data: encodeSelfBatch(calls.map((call) => ({ ...call, value: 0n }))), value, chainId: network.chainId });

test("a payout signs only the lines on its card, relayed or sent by the wallet itself", () => {
  const card = transferCalls(usdc, lines);
  checkBatch({ typedData: relayed(card) }, card, wallet);
  checkBatch({ transaction: selfSent(card) }, card, wallet);
  // One line: a single pinned call (relayed) and a single packed call (self-sent).
  const single = transferCalls(usdc, [lines[0]!]);
  checkBatch({ typedData: relayed(single) }, single, wallet);
  checkBatch({ transaction: selfSent(single) }, single, wallet);

  const more = transferCalls(usdc, [lines[0]!, { address: two, amount: "2000000" }]);
  refused(() => checkBatch({ typedData: relayed(more) }, card, wallet), /other calls than its card/);
  refused(() => checkBatch({ transaction: selfSent(more) }, card, wallet), /other calls than its card/);
  refused(() => checkBatch({ typedData: relayed([...card, ...single]) }, card, wallet), /other calls than its card/);
  refused(() => checkBatch({ typedData: relayed(card, other) }, card, wallet), /another wallet/);
  refused(() => checkBatch({ typedData: relayed(card, wallet, nowSeconds() + 30 * 86_400) }, card, wallet), /longer than minutes/);
  refused(() => checkBatch({ transaction: selfSent(card, other) }, card, wallet), /sent somewhere else/);
  refused(() => checkBatch({ transaction: selfSent(card, wallet, "1") }, card, wallet), /native value/);
  refused(() => checkBatch({ transaction: { ...selfSent(card), chainId: 1 } }, card, wallet), /other than Arc/);
  refused(() => checkBatch({ transaction: { ...selfSent(card), to: DELEGATION_FRAMEWORK.delegationManager } }, card, wallet), /sent somewhere else/);
});

/** The typed data the api hands over for a gas-free send (send/relayed.ts `serializableTypedData`). */
const authorization = (overrides: { token?: string; from?: string; to?: string; value?: string; validBefore?: number; chainId?: number } = {}) => ({
  domain: { name: "USDC", version: "2", chainId: overrides.chainId ?? network.chainId, verifyingContract: overrides.token ?? usdc },
  types: {},
  primaryType: "TransferWithAuthorization",
  message: { from: overrides.from ?? wallet, to: overrides.to ?? one, value: overrides.value ?? "5000000", validAfter: "0", validBefore: String(overrides.validBefore ?? nowSeconds() + TEN_MINUTES), nonce: `0x${"22".repeat(32)}` },
});

test("a gas-free send signs only the card's amount of its token to its recipient, for minutes", () => {
  const card = { token: usdc, to: one, amount: "5000000" };
  checkTransferAuthorization(authorization(), card, wallet);
  checkTransferAuthorization(authorization({ token: eurc }), { ...card, token: eurc }, wallet);
  refused(() => checkTransferAuthorization(authorization({ to: two }), card, wallet), /someone other than its card/);
  refused(() => checkTransferAuthorization(authorization({ value: "5000001" }), card, wallet), /another amount/);
  refused(() => checkTransferAuthorization(authorization({ from: other }), card, wallet), /another wallet/);
  refused(() => checkTransferAuthorization(authorization({ token: other }), { ...card, token: other }, wallet), /other than USDC or EURC/);
  refused(() => checkTransferAuthorization(authorization({ token: eurc }), card, wallet), /another token than its card/);
  refused(() => checkTransferAuthorization(authorization({ chainId: 1 }), card, wallet), /other than Arc/);
  refused(() => checkTransferAuthorization(authorization({ validBefore: nowSeconds() + 7 * 86_400 }), card, wallet), /longer than minutes/);
  refused(() => checkTransferAuthorization({ ...authorization(), primaryType: "Permit" }, card, wallet), /another type name/);
});

test("the marketplace grant signs only USDC transfers to the person's own agent wallet, as its card says", () => {
  const agent = privateKeyToAccount(generatePrivateKey()).address;
  const startsAt = nowSeconds();
  const grant = buildMarketplaceGrant({ network, wallet, redeemer: relayer, token: usdc, amountPerPeriod: 20_000_000n, periodSeconds: 86_400, startsAt, expiresAt: startsAt + 365 * 86_400, salt: `0x${"33".repeat(32)}` as Hex, agentWallet: agent });
  const typedData = json(grantTypedData(network, grant));
  const receipt = json(describeGrant(network, grant)) as unknown as ShownGrant;
  const decoded = checkTransferGrant(typedData, receipt, wallet);
  assert.ok(receiptOf(decoded).recipient?.toLowerCase().endsWith(agent.slice(2).toLowerCase()), "pinned to the agent wallet");
  refused(() => checkTransferGrant(typedData, { ...receipt, amountPerPeriod: "1000000" }, wallet), /differs from its card in: amount/);
  refused(() => checkTransferGrant(typedData, { ...receipt, recipient: other }, wallet), /recipient/);
});
