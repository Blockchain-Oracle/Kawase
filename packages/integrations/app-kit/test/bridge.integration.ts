// A bridge on testnet the way Kawase does it: a new wallet is set up (EIP-7702, relayed) and funded on Arc, App Kit
// estimates and builds approve + burn, the calls are captured and checked, the wallet signs ONE transaction to
// itself, and Circle's forwarder mints on Base Sepolia (no wallet or gas there). Done when IRIS reports the forward
// complete and the recipient's USDC on Base Sepolia went up by the amount less at most the fee cap.
// Run: pnpm --filter @kawase/integrations-app-kit test:bridge (needs the root .env).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, formatUnits, http, parseUnits, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import { encodeSelfBatch, isWalletSetUp, setupAuthorizationRequest } from "@kawase/integrations-delegation";
import { getNetwork } from "@kawase/networks";

import { bridgeDestination, bridgeProgress, checkBridgeCalls, estimateBridge, forwardDelivered, prepareBridge } from "../src";

config({ path: new URL("../../../../.env", import.meta.url).pathname, quiet: true });

const network = getNetwork("testnet");
const transport = http(process.env.ARC_RPC_URL_TESTNET ?? "https://rpc.testnet.arc.network");
const client = createPublicClient({ chain: network.viemChain, transport });
const relayer = createWalletClient({ account: privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY_TESTNET as Hex), chain: network.viemChain, transport });
const apiKey = process.env.CIRCLE_TEST_API_KEY!;
const circle = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret: process.env.CIRCLE_TEST_ENTITY_SECRET! });
const opsAddress = process.env.OPS_WALLET_ADDRESS_TESTNET as Hex;
const AMOUNT = "1";
const POLL_MS = 3000;
const POLL_ATTEMPTS = 100;
const DONE = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const destination = bridgeDestination(network, "base");
const base = createPublicClient({ chain: baseSepolia, transport: http(destination.rpcUrl) });
const user = privateKeyToAccount(generatePrivateKey());
const wallet = createWalletClient({ account: user, chain: network.viemChain, transport });
console.log("user", user.address, "→", destination.kitChain, "domain", destination.domain);

// 1. Set up and fund.
{
  const nonce = await client.getTransactionCount({ address: user.address });
  const authorization = await user.signAuthorization(setupAuthorizationRequest(network, nonce));
  await client.waitForTransactionReceipt({ hash: await relayer.sendTransaction({ authorizationList: [authorization], to: user.address, data: "0x" }) });
  assert.ok(isWalletSetUp(await client.getCode({ address: user.address })));
  const drip = await circle.createTransaction({
    walletAddress: opsAddress,
    blockchain: network.circleBlockchain,
    tokenAddress: network.addresses.usdc,
    destinationAddress: user.address,
    amount: ["1.2"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  });
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    if (DONE.includes((await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "")) break;
    await wait(POLL_MS);
  }
}

// 2. Estimate, build, check.
const input = { network, client, apiKey, from: user.address, destination, recipient: user.address, amount: AMOUNT };
const estimate = await estimateBridge(input);
console.log("fee cap", formatUnits(estimate.maxFee, 6), estimate.fees);
const calls = await prepareBridge(input);
const expected = { usdc: network.addresses.usdc, amount: parseUnits(AMOUNT, 6), recipient: user.address, domain: destination.domain, maxFee: estimate.maxFee };
const check = checkBridgeCalls(network, calls, expected);
assert.equal(check.ok, true, check.ok ? "" : check.reason);
assert.equal(checkBridgeCalls(network, calls, { ...expected, recipient: opsAddress }).ok, false, "another recipient is refused");
assert.equal(checkBridgeCalls(network, calls, { ...expected, domain: 0 }).ok, false, "another chain is refused");
assert.equal(checkBridgeCalls(network, calls, { ...expected, maxFee: 1n }).ok, false, "a higher fee than shown is refused");

// 3. One transaction: approve + burn.
const before = await base.readContract({ address: destination.usdc, abi: erc20Abi, functionName: "balanceOf", args: [user.address] });
const data = encodeSelfBatch(calls);
const gas = await client.estimateGas({ account: user.address, to: user.address, data });
const hash = await wallet.sendTransaction({ to: user.address, data, gas: (gas * 13n) / 10n });
const receipt = await client.waitForTransactionReceipt({ hash });
assert.equal(receipt.status, "success");
console.log("burned in one transaction", hash, "gas", receipt.gasUsed);

// 4. Attestation and the forwarder's mint.
let progress = await bridgeProgress(network, hash);
for (let i = 0; i < POLL_ATTEMPTS && !forwardDelivered(progress) && progress?.forward !== "FAILED"; i++) {
  await wait(POLL_MS);
  progress = await bridgeProgress(network, hash).catch(() => progress);
  if (i % 5 === 0) console.log("  ·", JSON.stringify(progress));
}
assert.ok(forwardDelivered(progress), JSON.stringify(progress));
const after = await base.readContract({ address: destination.usdc, abi: erc20Abi, functionName: "balanceOf", args: [user.address] });
const minted = after - before;
assert.ok(minted > 0n, "minted");
assert.ok(minted >= expected.amount - estimate.maxFee, "at least the amount less the fee cap arrived");
console.log(`PASS bridged ${AMOUNT} USDC → +${formatUnits(minted, 6)} on ${destination.kitChain}, mint ${progress?.forwardTxHash}`);

// 5. Return what is left on Arc.
const left = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [user.address] });
if (left > parseUnits("0.02", 6)) await client.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "transfer", args: [opsAddress, left - parseUnits("0.02", 6)] }) });
