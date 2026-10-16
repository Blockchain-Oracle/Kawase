// A swap on Arc testnet the way Kawase does it: a brand-new wallet is set up (EIP-7702, relayed), funded, quoted
// by App Kit, the kit's calls are captured and checked, then the wallet signs ONE transaction to itself that
// approves and swaps atomically. The receipt must show exactly `amountIn` leaving and at least `minOut` arriving.
// Run: pnpm --filter @kawase/integrations-app-kit test:arc-testnet (needs the root .env).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, decodeEventLog, erc20Abi, formatUnits, http, parseUnits, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { encodeSelfBatch, isWalletSetUp, setupAuthorizationRequest } from "@kawase/integrations-delegation";
import { getNetwork } from "@kawase/networks";

import { checkSwapCalls, marketPrices, prepareSwap, quoteSwap } from "../src";

config({ path: new URL("../../../../.env", import.meta.url).pathname, quiet: true });

const network = getNetwork("testnet");
const rpcUrl = process.env.ARC_RPC_URL_TESTNET ?? "https://rpc.testnet.arc.io";
const apiKey = process.env.CIRCLE_TEST_API_KEY!;
const opsAddress = process.env.OPS_WALLET_ADDRESS_TESTNET as Hex;
const transport = http(rpcUrl);
const client = createPublicClient({ chain: network.viemChain, transport });
const relayer = createWalletClient({ account: privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY_TESTNET as Hex), chain: network.viemChain, transport });
const circle = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret: process.env.CIRCLE_TEST_ENTITY_SECRET! });
const USDC = network.addresses.usdc;
const EURC = network.addresses.eurc;
const AMOUNT = "0.5";
const SLIPPAGE_BPS = 200;
const POLL_MS = 2000;
const POLL_ATTEMPTS = 60;
const DONE = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const balance = (token: Hex, who: Hex) => client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] });

const user = privateKeyToAccount(generatePrivateKey());
const wallet = createWalletClient({ account: user, chain: network.viemChain, transport });
console.log("user", user.address);

// 1. Setup: the user signs the authorization, the relayer sends it.
{
  const nonce = await client.getTransactionCount({ address: user.address });
  const authorization = await user.signAuthorization(setupAuthorizationRequest(network, nonce));
  const hash = await relayer.sendTransaction({ authorizationList: [authorization], to: user.address, data: "0x" });
  await client.waitForTransactionReceipt({ hash });
  assert.ok(isWalletSetUp(await client.getCode({ address: user.address })), "7702 setup");
  console.log("set up", hash);
}

// 2. Fund 1 USDC from the ops wallet.
{
  const drip = await circle.createTransaction({
    walletAddress: opsAddress,
    blockchain: network.circleBlockchain,
    tokenAddress: USDC,
    destinationAddress: user.address,
    amount: ["1"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  });
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
    if (DONE.includes(state)) break;
    await wait(POLL_MS);
  }
  console.log("funded", formatUnits(await balance(USDC, user.address), 6), "USDC");
}

// 3. Quote, prepare, check.
const input = { network, client, apiKey, from: user.address, tokenIn: USDC, tokenOut: EURC, amountIn: AMOUNT, slippageBps: SLIPPAGE_BPS };
const quote = await quoteSwap({ ...input, decimalsOut: 6 });
console.log("quote", formatUnits(quote.estimatedOut, 6), "EURC, at least", formatUnits(quote.minOut, 6), quote.fees);
const prices = await marketPrices(network, apiKey, [USDC, EURC]);
console.log("market", Object.fromEntries(prices));
// Built at half the quote's slippage, so the route's own minimum clears the minimum the person was shown.
const calls = await prepareSwap({ ...input, slippageBps: SLIPPAGE_BPS / 2 });
console.log("captured", calls.length, "call(s):", calls.map((call) => `${call.to} ${call.data.slice(0, 10)}`).join(", "));
const expected = { from: user.address, tokenIn: USDC, tokenOut: EURC, amountIn: parseUnits(AMOUNT, 6), minOut: quote.minOut };
const check = checkSwapCalls(network, calls, expected);
assert.equal(check.ok, true, JSON.stringify(check));
console.log("guaranteed by the calls", check.ok ? formatUnits(check.guaranteedOut, 6) : "-");
// A different amount, another beneficiary or a higher minimum are refused.
assert.equal(checkSwapCalls(network, calls, { ...expected, amountIn: parseUnits("0.4", 6) }).ok, false);
assert.equal(checkSwapCalls(network, calls, { ...expected, from: opsAddress }).ok, false);
assert.equal(checkSwapCalls(network, calls, { ...expected, minOut: quote.estimatedOut * 2n }).ok, false);

// 4. One transaction to itself: approve + swap, atomically.
const data = encodeSelfBatch(calls);
const gas = await client.estimateGas({ account: user.address, to: user.address, data });
const before = { usdc: await balance(USDC, user.address), eurc: await balance(EURC, user.address) };
const hash = await wallet.sendTransaction({ to: user.address, data, gas: (gas * 13n) / 10n });
const receipt = await client.waitForTransactionReceipt({ hash });
assert.equal(receipt.status, "success");
const transfers = receipt.logs.flatMap((log) => {
  try {
    const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
    return event.eventName === "Transfer" ? [{ token: log.address.toLowerCase(), ...event.args }] : [];
  } catch {
    return [];
  }
});
const out = transfers.find((t) => t.token === USDC.toLowerCase() && t.from.toLowerCase() === user.address.toLowerCase());
const into = transfers.find((t) => t.token === EURC.toLowerCase() && t.to.toLowerCase() === user.address.toLowerCase());
assert.equal(out?.value, parseUnits(AMOUNT, 6), "exactly the amount left");
assert.ok(into && into.value >= quote.minOut, "at least the stop limit arrived");
const after = { usdc: await balance(USDC, user.address), eurc: await balance(EURC, user.address) };
console.log(`PASS swap in one transaction ${hash}: −${formatUnits(before.usdc - after.usdc, 6)} USDC (incl. gas), +${formatUnits(after.eurc - before.eurc, 6)} EURC, gas ${receipt.gasUsed}`);

// 5. Return what is left to the ops wallet.
for (const token of [EURC, USDC]) {
  const left = await balance(token, user.address);
  const keep = token === USDC ? parseUnits("0.02", 6) : 0n;
  if (left > keep) await client.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [opsAddress, left - keep] }) });
}
