// Earn on Arc testnet the way Kawase does it: a new wallet is set up and funded, App Kit builds a deposit into a
// mock Morpho vault, the calls are captured and checked like a swap (USDC in, the vault's shares out to the wallet),
// the wallet signs ONE transaction; then the same for a withdrawal. Run: pnpm --filter @kawase/integrations-app-kit test:earn
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, decodeFunctionData, erc20Abi, formatUnits, http, parseAbi, parseUnits, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { encodeSelfBatch, isWalletSetUp, setupAuthorizationRequest } from "@kawase/integrations-delegation";
import { getNetwork } from "@kawase/networks";

import { checkEarnCalls, exploreVaults, prepareEarnDeposit, prepareEarnWithdraw, vaultPosition, vaultPreview } from "../src";

config({ path: new URL("../../../../.env", import.meta.url).pathname, quiet: true });

const network = getNetwork("testnet");
const transport = http(process.env.ARC_RPC_URL_TESTNET ?? "https://rpc.testnet.arc.network");
const client = createPublicClient({ chain: network.viemChain, transport });
const relayer = createWalletClient({ account: privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY_TESTNET as Hex), chain: network.viemChain, transport });
const apiKey = process.env.CIRCLE_TEST_API_KEY!;
const circle = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret: process.env.CIRCLE_TEST_ENTITY_SECRET! });
const opsAddress = process.env.OPS_WALLET_ADDRESS_TESTNET as Hex;
const DONE = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const ADAPTER = parseAbi([
  "struct Instruction { address target; bytes data; uint256 value; address tokenIn; uint256 amountToApprove; address tokenOut; uint256 minTokenOut; }",
  "struct TokenRecipient { address token; address beneficiary; }",
  "struct ExecutionParams { Instruction[] instructions; TokenRecipient[] tokens; uint256 execId; uint256 deadline; bytes metadata; }",
  "struct TokenInput { uint8 permitType; address token; uint256 amount; bytes permitCalldata; }",
  "function execute(ExecutionParams params, TokenInput[] tokenInputs, bytes signature) payable",
]);
const show = (label: string, calls: { to: Hex; data: Hex }[]) => {
  const d = decodeFunctionData({ abi: ADAPTER, data: calls[calls.length - 1]!.data });
  const [p, inputs] = d.args;
  console.log(label, JSON.stringify({ calls: calls.map((c) => [c.to, c.data.slice(0, 10)]), instructions: p.instructions.map((i) => ({ target: i.target, tokenIn: i.tokenIn, amountToApprove: i.amountToApprove, tokenOut: i.tokenOut, minTokenOut: i.minTokenOut })), tokens: p.tokens, inputs: inputs.map((i) => ({ token: i.token, amount: i.amount })) }, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
};

const vaults = await exploreVaults(network, apiKey);
console.log("vaults", vaults.map((v) => `${v.name} ${v.address} ${(v.apy * 100).toFixed(2)}% ${v.status}`));
const vault = vaults[0]!.address;

const user = privateKeyToAccount(generatePrivateKey());
const wallet = createWalletClient({ account: user, chain: network.viemChain, transport });
{
  const nonce = await client.getTransactionCount({ address: user.address });
  const authorization = await user.signAuthorization(setupAuthorizationRequest(network, nonce));
  await client.waitForTransactionReceipt({ hash: await relayer.sendTransaction({ authorizationList: [authorization], to: user.address, data: "0x" }) });
  assert.ok(isWalletSetUp(await client.getCode({ address: user.address })));
  const drip = await circle.createTransaction({ walletAddress: opsAddress, blockchain: network.circleBlockchain, tokenAddress: network.addresses.usdc, destinationAddress: user.address, amount: ["1.2"], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
  for (let i = 0; i < 60; i++) {
    if (DONE.includes((await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "")) break;
    await wait(2000);
  }
}
const send = async (calls: { to: Hex; data: Hex; value: bigint }[]) => {
  const data = encodeSelfBatch(calls);
  const gas = await client.estimateGas({ account: user.address, to: user.address, data });
  const hash = await wallet.sendTransaction({ to: user.address, data, gas: (gas * 13n) / 10n });
  const receipt = await client.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  return { hash, gas: receipt.gasUsed };
};

// Deposit 1 USDC.
const amount = parseUnits("1", 6);
const preview = await vaultPreview(client, vault, amount);
const deposit = await prepareEarnDeposit({ network, client, apiKey, from: user.address, vault, amount: "1" });
show("deposit", deposit);
const minShares = (preview.sharesIn * 99n) / 100n;
const depositCheck = checkEarnCalls(network, "deposit", deposit, { from: user.address, usdc: network.addresses.usdc, vault, maxIn: amount, minOut: minShares });
assert.equal(depositCheck.ok, true, depositCheck.ok ? "" : depositCheck.reason);
const d = await send(deposit);
const afterDeposit = await vaultPosition(client, vault, user.address);
console.log("deposited", d.hash, "gas", d.gas, "position", formatUnits(afterDeposit.assets, 6), "USDC in", afterDeposit.shares, "shares");
assert.ok(afterDeposit.shares >= minShares);

// Withdraw 0.5 USDC.
let withdraw;
for (let attempt = 1; ; attempt++) {
  try {
    withdraw = await prepareEarnWithdraw({ network, client, apiKey, from: user.address, vault, amount: "0.5" });
    break;
  } catch (error) {
    const e = error as { message?: string; cause?: { trace?: { responseBody?: unknown } } };
    console.log("withdraw attempt", attempt, e.message?.slice(0, 200), JSON.stringify(e.cause?.trace?.responseBody ?? e.cause ?? "").slice(0, 400));
    if (attempt >= 6) throw error;
    await wait(5000);
  }
}
show("withdraw", withdraw);
const half = parseUnits("0.5", 6);
const sharesOut = (await vaultPreview(client, vault, half)).sharesOut;
const maxShares = (sharesOut * 101n) / 100n < afterDeposit.shares ? (sharesOut * 101n) / 100n : afterDeposit.shares;
const withdrawCheck = checkEarnCalls(network, "withdraw", withdraw!, { from: user.address, usdc: network.addresses.usdc, vault, maxIn: maxShares, minOut: (half * 99n) / 100n });
assert.equal(withdrawCheck.ok, true, withdrawCheck.ok ? "" : withdrawCheck.reason);
const usdcBefore = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [user.address] });
const w = await send(withdraw!);
const usdcAfter = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [user.address] });
const afterWithdraw = await vaultPosition(client, vault, user.address);
console.log("withdrew", w.hash, "USDC +", formatUnits(usdcAfter - usdcBefore, 6), "(less gas), position", formatUnits(afterWithdraw.assets, 6));
