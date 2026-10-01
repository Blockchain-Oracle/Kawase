// Bridge rules' grants on Arc testnet (Stage 8b): a new wallet signs the two bridge grants for Base Sepolia, and
// Kawase's ops wallet bridges USDC to the wallet's own address there — App Kit's own captured calls, redeemed under
// the grants, minted by Circle's forwarder — without the wallet signing again. Then the chain is asked to do what the
// grants must never allow: mint to someone else, mint on another chain, let the route take more than the fee bound,
// change the hook, add a developer fee, or approve anyone but the bridge; and, after one revoke transaction, anything.
// Run: pnpm --filter @kawase/integrations-app-kit test:bridge-grants
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, formatUnits, http, pad, parseUnits, stringToHex, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import {
  BRIDGE_GRANT_MAX_FEE,
  BRIDGE_PURPOSES,
  buildBridgeGrants,
  encodeRedeemMany,
  encodeRevoke,
  encodeSelfBatch,
  grantTypedData,
  isWalletSetUp,
  setupAuthorizationRequest,
  withSignature,
  type BridgeGrants,
} from "@kawase/integrations-delegation";
import { getNetwork } from "@kawase/networks";

import { bridgeContract, bridgeDestination, bridgeProgress, checkBridgeCalls, forwardDelivered, mintedTo, prepareBridge } from "../src";

config({ path: new URL("../../../../.env", import.meta.url).pathname, quiet: true });

const network = getNetwork("testnet");
const usdc = network.addresses.usdc;
const transport = http(process.env.ARC_RPC_URL_TESTNET ?? "https://rpc.testnet.arc.network");
const client = createPublicClient({ chain: network.viemChain, transport });
const relayer = createWalletClient({ account: privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY_TESTNET as Hex), chain: network.viemChain, transport });
const apiKey = process.env.CIRCLE_TEST_API_KEY!;
const circle = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret: process.env.CIRCLE_TEST_ENTITY_SECRET! });
const opsAddress = process.env.OPS_WALLET_ADDRESS_TESTNET as Address;
const opsWalletId = process.env.OPS_WALLET_ID_TESTNET!;
const EXPLORER = "https://testnet.arcscan.app/tx/";
const DONE = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const units = (amount: string) => parseUnits(amount, 6);
const salt = () => toHex(randomBytes(32));
const bridge = bridgeContract(network);
const destination = bridgeDestination(network, "base");

async function circleDone(id: string) {
  for (let i = 0; i < 90; i++) {
    const transaction = (await circle.getTransaction({ id })).data?.transaction;
    if (transaction && DONE.includes(transaction.state)) return transaction;
    await wait(2000);
  }
  throw new Error(`Circle transaction ${id} did not finish`);
}

async function ops(call: { to: Address; data: Hex }) {
  try {
    const created = await circle.createContractExecutionTransaction({ walletId: opsWalletId, contractAddress: call.to, callData: call.data, fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
    const transaction = await circleDone(created.data?.id ?? "");
    return { ok: transaction.state === "COMPLETE", tx: transaction.txHash as Hex | undefined };
  } catch {
    return { ok: false, tx: undefined };
  }
}

const results: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, tx?: string) => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, tx ? EXPLORER + tx : "");
};
/** The calldata with one 32-byte word (counted after the selector) replaced. */
const withWord = (data: Hex, word: number, value: Hex): Hex => {
  const start = 2 + (4 + word * 32) * 2;
  return `${data.slice(0, start)}${pad(value, { size: 32 }).slice(2)}${data.slice(start + 64)}` as Hex;
};

// A new wallet: set up by the relayer, funded by the ops wallet.
const user = privateKeyToAccount(generatePrivateKey());
const wallet = createWalletClient({ account: user, chain: network.viemChain, transport });
{
  const nonce = await client.getTransactionCount({ address: user.address });
  const authorization = await user.signAuthorization(setupAuthorizationRequest(network, nonce));
  await client.waitForTransactionReceipt({ hash: await relayer.sendTransaction({ authorizationList: [authorization], to: user.address, data: "0x" }) });
  assert.ok(isWalletSetUp(await client.getCode({ address: user.address })));
  const drip = await circle.createTransaction({ walletAddress: opsAddress, blockchain: network.circleBlockchain, tokenAddress: usdc, destinationAddress: user.address, amount: ["1"], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
  await circleDone(drip.data?.id ?? "");
}
const balance = () => client.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [user.address] });
console.log("user", user.address, "USDC", formatUnits(await balance(), 6), "→", destination.id, "domain", destination.domain);

// The two grants, signed once each (on a phone: one Face ID).
const unsigned = buildBridgeGrants({ network, wallet: user.address, redeemer: opsAddress, usdc, bridge, domain: destination.domain, expiresAt: Math.floor(Date.now() / 1000) + 3600, salts: { allowance: salt(), burn: salt() } });
const grants = Object.fromEntries(
  await Promise.all(BRIDGE_PURPOSES.map(async (purpose) => [purpose, withSignature(unsigned[purpose], await user.signTypedData(grantTypedData(network, unsigned[purpose])))])),
) as BridgeGrants;

// App Kit's own calls for 0.5 USDC to the wallet's own address on Base Sepolia, checked like any bridge.
const amount = units("0.5");
const calls = await prepareBridge({ network, client, apiKey, from: user.address, destination, recipient: user.address, amount: "0.5" });
const checked = checkBridgeCalls(network, calls, { usdc, amount, recipient: user.address, domain: destination.domain, maxFee: BRIDGE_GRANT_MAX_FEE });
assert.ok(checked.ok, checked.ok ? "" : checked.reason);
assert.equal(calls.length, 2, "App Kit sends an allowance then the burn");
const [allowanceCall, burnCall] = calls as unknown as [{ to: Address; data: Hex }, { to: Address; data: Hex }];
const redeem = (allowanceData: Hex, burnData: Hex) =>
  encodeRedeemMany(network, [
    { grant: grants.allowance, target: usdc, callData: allowanceData },
    { grant: grants.burn, target: bridge, callData: burnData },
  ]);

// What must never work (tried first, while the wallet still holds everything).
const stranger = privateKeyToAccount(generatePrivateKey()).address;
let r = await ops(redeem(allowanceCall.data, withWord(burnCall.data, 3, stranger)));
check("minting to someone else is refused on chain", !r.ok, r.tx);
r = await ops(redeem(allowanceCall.data, withWord(burnCall.data, 7, toHex(3))));
check("minting on another chain is refused on chain", !r.ok, r.tx);
r = await ops(redeem(allowanceCall.data, withWord(burnCall.data, 1, toHex(BRIDGE_GRANT_MAX_FEE + 1n))));
check("a fee cap above the bound is refused on chain", !r.ok, r.tx);
r = await ops(redeem(allowanceCall.data, withWord(burnCall.data, 11, stringToHex("cctp-forwarX", { size: 32 }))));
check("another hook is refused on chain", !r.ok, r.tx);
r = await ops(redeem(allowanceCall.data, withWord(burnCall.data, 2, toHex(1))));
check("a developer fee is refused on chain", !r.ok, r.tx);
r = await ops(redeem(withWord(allowanceCall.data, 0, stranger), burnCall.data));
check("an allowance for anyone but the bridge is refused on chain", !r.ok, r.tx);
check("nothing left the wallet while refusing", (await balance()) === units("1"));

// The real one: the ops wallet bridges 0.5 USDC to the wallet's own address on Base Sepolia.
const before = await balance();
r = await ops(redeem(allowanceCall.data, burnCall.data));
check("ops wallet bridges 0.5 USDC to the wallet's own address on Base Sepolia", r.ok && before - (await balance()) === amount, r.tx);
let minted: bigint | undefined;
for (let i = 0; i < 60 && r.tx && minted === undefined; i++) {
  await wait(5000);
  const progress = await bridgeProgress(network, r.tx).catch(() => null);
  if (forwardDelivered(progress)) minted = await mintedTo(destination, progress!.forwardTxHash as Hex, user.address);
}
check(`Circle's forwarder minted ${minted === undefined ? "nothing" : formatUnits(minted, 6)} USDC to the wallet on Base Sepolia`, minted !== undefined && minted > 0n && minted <= amount);

// Revoke both in one transaction from the wallet; then nothing works.
{
  const data = encodeSelfBatch(BRIDGE_PURPOSES.map((purpose) => ({ ...encodeRevoke(network, grants[purpose]), value: 0n })));
  const hash = await wallet.sendTransaction({ to: user.address, data });
  const receipt = await client.waitForTransactionReceipt({ hash });
  check("the wallet revokes both grants in one transaction", receipt.status === "success", hash);
  const again = await prepareBridge({ network, client, apiKey, from: user.address, destination, recipient: user.address, amount: "0.1" });
  r = await ops(redeem(again[0]!.data, again[1]!.data));
  check("after the revoke the ops wallet cannot bridge", !r.ok, r.tx);
}

// Give the test money back to the ops wallet.
{
  const left = await balance();
  const reserve = units("0.02");
  if (left > reserve) await client.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: usdc, abi: erc20Abi, functionName: "transfer", args: [opsAddress, left - reserve] }) });
}

const passed = results.filter((result) => result.ok).length;
console.log(`\n${passed}/${results.length} as expected`);
process.exit(passed === results.length ? 0 : 1);
