// Auto-save's grants on Arc testnet (Stage 8b): a new wallet signs the three save grants for a mock Morpho vault, and
// Kawase's ops wallet moves USDC into the wallet's own position and back without the wallet signing again. Then the
// chain is asked to do what the grants must never allow — deposit for someone else, approve someone else, withdraw
// to someone else, redeem by anyone but the ops wallet — and after the wallet revokes all three in one transaction,
// anything at all. Run: pnpm --filter @kawase/integrations-app-kit test:auto-save
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, encodeFunctionData, erc20Abi, formatUnits, http, parseAbi, parseUnits, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import {
  SAVE_PURPOSES,
  buildSaveGrants,
  describeGrant,
  encodeRedeem,
  encodeRedeemSave,
  encodeRevoke,
  encodeSelfBatch,
  grantTypedData,
  isWalletSetUp,
  setupAuthorizationRequest,
  withSignature,
  type SaveGrants,
} from "@kawase/integrations-delegation";
import { getNetwork } from "@kawase/networks";

import { exploreVaults, vaultPosition } from "../src";

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
const VAULT = parseAbi(["function deposit(uint256 assets, address receiver) returns (uint256)", "function withdraw(uint256 assets, address receiver, address owner) returns (uint256)", "function redeem(uint256 shares, address receiver, address owner) returns (uint256)"]);

async function circleDone(id: string) {
  for (let i = 0; i < 90; i++) {
    const transaction = (await circle.getTransaction({ id })).data?.transaction;
    if (transaction && DONE.includes(transaction.state)) return transaction;
    await wait(2000);
  }
  throw new Error(`Circle transaction ${id} did not finish`);
}

/** The ops wallet sends a call; whether it completed on chain. */
async function ops(call: { to: Address; data: Hex }) {
  try {
    const created = await circle.createContractExecutionTransaction({ walletId: opsWalletId, contractAddress: call.to, callData: call.data, fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
    const transaction = await circleDone(created.data?.id ?? "");
    return { ok: transaction.state === "COMPLETE", tx: transaction.txHash, detail: transaction.errorReason };
  } catch (error) {
    return { ok: false, tx: undefined, detail: (error as Error).message.slice(0, 160) };
  }
}

const results: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, tx?: string) => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, tx ? EXPLORER + tx : "");
};

const vaults = await exploreVaults(network, apiKey);
const vault = vaults.find((entry) => entry.status === "active")?.address ?? vaults[0]!.address;
console.log("vault", vault);

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
console.log("user", user.address, "USDC", formatUnits(await balance(), 6));

// The three grants, signed once each (on a phone: one Face ID, three signatures).
const unsigned = buildSaveGrants({ network, wallet: user.address, redeemer: opsAddress, usdc, vault, expiresAt: Math.floor(Date.now() / 1000) + 3600, salts: { approve: salt(), deposit: salt(), withdraw: salt() } });
const grants = Object.fromEntries(
  await Promise.all(SAVE_PURPOSES.map(async (purpose) => [purpose, withSignature(unsigned[purpose], await user.signTypedData(grantTypedData(network, unsigned[purpose])))])),
) as SaveGrants;
{
  const approve = describeGrant(network, grants.approve);
  const deposit = describeGrant(network, grants.deposit);
  const withdraw = describeGrant(network, grants.withdraw);
  check(
    "receipts decoded from the signed grants pin the vault and the wallet",
    approve.pins.length === 1 && approve.pins[0]!.address.toLowerCase() === vault.toLowerCase() &&
      deposit.pins.length === 1 && deposit.pins[0]!.startIndex === 36 && deposit.pins[0]!.address.toLowerCase() === user.address.toLowerCase() &&
      withdraw.pins.length === 2 && withdraw.pins.every((pin) => pin.address.toLowerCase() === user.address.toLowerCase()) &&
      [approve, deposit, withdraw].every((receipt) => receipt.unknownCaveats.length === 0 && receipt.maxNativeValue === 0n && receipt.redeemers[0]?.toLowerCase() === opsAddress.toLowerCase()),
  );
}

// In: 0.6 USDC into the wallet's own position, by the ops wallet alone.
const before = await balance();
let r = await ops(encodeRedeemSave(network, grants, { direction: "in", amount: units("0.6"), wallet: user.address, usdc, vault }));
const afterIn = await vaultPosition(client, vault, user.address);
check("ops wallet saves 0.6 USDC into the wallet's own position", r.ok && before - (await balance()) === units("0.6") && afterIn.assets >= units("0.59"), r.tx);

// Out: 0.25 USDC back.
const beforeOut = await balance();
r = await ops(encodeRedeemSave(network, grants, { direction: "out", amount: units("0.25"), wallet: user.address, usdc, vault }));
check("ops wallet tops the wallet up with 0.25 USDC from its position", r.ok && (await balance()) - beforeOut === units("0.25"), r.tx);

// What must never work.
const stranger = privateKeyToAccount(generatePrivateKey()).address;
const redeem = (delegation: SaveGrants[keyof SaveGrants], target: Address, callData: Hex) => encodeRedeem(network, delegation, { target, callData });
r = await ops(redeem(grants.deposit, vault, encodeFunctionData({ abi: VAULT, functionName: "deposit", args: [units("0.01"), stranger] })));
check("deposit for someone else is refused on chain", !r.ok, r.tx);
r = await ops(redeem(grants.approve, usdc, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [stranger, units("1")] })));
check("approving someone else is refused on chain", !r.ok, r.tx);
r = await ops(redeem(grants.withdraw, vault, encodeFunctionData({ abi: VAULT, functionName: "withdraw", args: [units("0.01"), stranger, user.address] })));
check("withdrawing to someone else is refused on chain", !r.ok, r.tx);
r = await ops(redeem(grants.withdraw, vault, encodeFunctionData({ abi: VAULT, functionName: "redeem", args: [1n, user.address, user.address] })));
check("a method the grant does not name is refused on chain", !r.ok, r.tx);
{
  const call = encodeRedeemSave(network, grants, { direction: "in", amount: units("0.01"), wallet: user.address, usdc, vault });
  const hash = await relayer.sendTransaction({ to: call.to, data: call.data, gas: 400_000n }).catch(() => undefined);
  const receipt = hash ? await client.waitForTransactionReceipt({ hash }) : undefined;
  check("a redeem by anyone but the ops wallet is refused on chain", receipt?.status !== "success", hash);
}

// Revoke all three in one transaction from the wallet; then nothing works.
{
  const data = encodeSelfBatch(SAVE_PURPOSES.map((purpose) => ({ ...encodeRevoke(network, grants[purpose]), value: 0n })));
  const hash = await wallet.sendTransaction({ to: user.address, data });
  const receipt = await client.waitForTransactionReceipt({ hash });
  check("the wallet revokes all three grants in one transaction", receipt.status === "success", hash);
  r = await ops(encodeRedeemSave(network, grants, { direction: "in", amount: units("0.01"), wallet: user.address, usdc, vault }));
  check("after the revoke the ops wallet cannot save", !r.ok, r.tx);
  r = await ops(encodeRedeemSave(network, grants, { direction: "out", amount: units("0.01"), wallet: user.address, usdc, vault }));
  check("after the revoke the ops wallet cannot withdraw", !r.ok, r.tx);
}

// Give the test money back to the ops wallet.
{
  const position = await vaultPosition(client, vault, user.address);
  if (position.shares > 0n) await client.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: vault, abi: VAULT, functionName: "redeem", args: [position.shares, user.address, user.address] }) });
  const left = await balance();
  const reserve = units("0.02");
  if (left > reserve) await client.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: usdc, abi: erc20Abi, functionName: "transfer", args: [opsAddress, left - reserve] }) });
}

const passed = results.filter((result) => result.ok).length;
console.log(`\n${passed}/${results.length} as expected`);
process.exit(passed === results.length ? 0 : 1);
