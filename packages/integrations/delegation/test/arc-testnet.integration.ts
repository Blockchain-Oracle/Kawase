// Integration test on Arc testnet (D22: test where we are uncertain). It runs the whole limits design
// through this package's own functions, with a local key standing in for the user's wallet:
// relayed EIP-7702 setup → allowance grant → agent spends inside it → refusals → automation grant →
// tampering → revoke. Needs CIRCLE_TEST_API_KEY and CIRCLE_TEST_ENTITY_SECRET in the repo .env, plus the
// funded test wallets recorded by spike 4 (or the three KAWASE_TEST_* variables).
// Run: pnpm --filter @kawase/integrations-delegation test:arc-testnet
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getNetwork } from "@kawase/networks";
import { localKeySigner } from "@kawase/wallet";

import {
  buildAllowanceGrant,
  buildAutomationGrant,
  describeGrant,
  encodeRedeemTransfer,
  encodeRevoke,
  grantTypedData,
  isWalletSetUp,
  setupAuthorizationRequest,
  withSignature,
} from "../src/index.ts";

config({ path: new URL("../../../../.env", import.meta.url).pathname, quiet: true });

const RPC_URL = "https://rpc.testnet.arc.io";
const EXPLORER_TX = "https://explorer.testnet.arc.io/tx/";
const USDC_DECIMALS = 6;
const PERIOD_SECONDS = 120;
const GRANT_TTL_SECONDS = 3600;
const POLL_MS = 2000;
const POLL_ATTEMPTS = 90;
const SALT_BYTES = 32;
const MS_PER_SECOND = 1000;
const PERIOD_MARGIN_SECONDS = 5;
const FUNDING_USDC = "0.75";
/** Left in the test wallet for the sweep transaction's own gas. */
const SWEEP_GAS_RESERVE_USDC = "0.02";
const usdc = (amount: string) => parseUnits(amount, USDC_DECIMALS);

const spikeStatePath = new URL("../../../../plan/spikes/code/04-delegation/.spike-state.testnet.json", import.meta.url);
const spikeState = existsSync(spikeStatePath) ? (JSON.parse(readFileSync(spikeStatePath, "utf8")) as Record<string, string>) : {};
const opsWalletId = process.env.KAWASE_TEST_OPS_WALLET_ID ?? spikeState.opsWalletId;
const opsAddress = (process.env.KAWASE_TEST_OPS_ADDRESS ?? spikeState.opsAddress) as Address | undefined;
const relayerKey = (process.env.KAWASE_TEST_RELAYER_KEY ?? spikeState.worker) as Hex | undefined;
if (!opsWalletId || !opsAddress || !relayerKey) throw new Error("Missing the ops wallet or relayer key for the test (see the header)");

const network = getNetwork("testnet");
const token = network.addresses.usdc;
const chain = network.viemChain;
const transport = http(RPC_URL);
const client = createPublicClient({ chain, transport });
const circle = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_TEST_API_KEY ?? "",
  entitySecret: process.env.CIRCLE_TEST_ENTITY_SECRET ?? "",
});

const user = localKeySigner(generatePrivateKey());
const userWallet = createWalletClient({ account: user, chain, transport });
const relayer = createWalletClient({ account: privateKeyToAccount(relayerKey), chain, transport });
const recipientA = privateKeyToAccount(generatePrivateKey()).address;
const recipientB = privateKeyToAccount(generatePrivateKey()).address;

type Result = { name: string; expected: "pass" | "fail"; ok: boolean; tx?: string | undefined; detail?: string | undefined };
const results: Result[] = [];
function record(name: string, expected: "pass" | "fail", ok: boolean, extra: { tx?: string | undefined; detail?: string | undefined } = {}) {
  results.push({ name, expected, ok, tx: extra.tx, detail: extra.detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} (expected ${expected})`, extra.tx ? EXPLORER_TX + extra.tx : "", extra.detail ?? "");
}

const balanceOf = (address: Address) => client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [address] });

async function waitForCircle(id: string) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const transaction = (await circle.getTransaction({ id })).data?.transaction;
    if (transaction && ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"].includes(transaction.state)) return transaction;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`Timed out waiting for Circle transaction ${id}`);
}

/** The agent's ops wallet sends a contract call. Returns whether it completed on chain. */
async function opsCall(call: { to: Address; data: Hex }) {
  try {
    const created = await circle.createContractExecutionTransaction({
      walletId: opsWalletId as string,
      contractAddress: call.to,
      callData: call.data,
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      idempotencyKey: randomUUID(),
    });
    const transaction = await waitForCircle(created.data?.id ?? "");
    return { ok: transaction.state === "COMPLETE", tx: transaction.txHash, detail: transaction.errorReason };
  } catch (error) {
    const e = error as { code?: number; message?: string };
    return { ok: false, tx: undefined, detail: `${e.code ?? ""} ${e.message ?? ""}`.trim() };
  }
}

const now = Math.floor(Date.now() / MS_PER_SECOND);
const terms = {
  network,
  wallet: user.address,
  redeemer: opsAddress,
  token,
  periodSeconds: PERIOD_SECONDS,
  startsAt: now - PERIOD_MARGIN_SECONDS,
  expiresAt: now + GRANT_TTL_SECONDS,
};
const salt = () => toHex(randomBytes(SALT_BYTES));

console.log("user", user.address, "| ops", opsAddress, "| relayer", relayer.account.address);

// 1. Setup: the user signs only the authorization; the relayer sends it. The wallet is empty at this point.
{
  const nonce = await client.getTransactionCount({ address: user.address });
  const authorization = await user.signAuthorization(setupAuthorizationRequest(network, nonce));
  const hash = await relayer.sendTransaction({ authorizationList: [authorization], to: user.address, data: "0x" });
  const receipt = await client.waitForTransactionReceipt({ hash });
  const code = await client.getCode({ address: user.address });
  record("relayed EIP-7702 setup of an empty wallet", "pass", receipt.status === "success" && isWalletSetUp(code), { tx: hash });
}

// 2. Fund the wallet so there is something to spend.
{
  const created = await circle.createTransaction({
    walletAddress: opsAddress,
    blockchain: "ARC-TESTNET",
    tokenAddress: token,
    destinationAddress: user.address,
    amount: [FUNDING_USDC],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  });
  const transaction = await waitForCircle(created.data?.id ?? "");
  console.log(`funded the user wallet with ${FUNDING_USDC} USDC`, transaction.txHash);
}

// 3. The everyday allowance: 0.5 USDC per period, any recipient.
const allowanceUnsigned = buildAllowanceGrant({ ...terms, amountPerPeriod: usdc("0.5"), salt: salt() });
const allowance = withSignature(allowanceUnsigned, await user.signTypedData(grantTypedData(network, allowanceUnsigned)));
{
  const receipt = describeGrant(network, allowance);
  const ok =
    receipt.token?.toLowerCase() === token.toLowerCase() &&
    receipt.amountPerPeriod === usdc("0.5") &&
    receipt.periodSeconds === PERIOD_SECONDS &&
    receipt.expiresAt === terms.expiresAt &&
    receipt.methods.join() === "0xa9059cbb" &&
    receipt.redeemers.map((r) => r.toLowerCase()).join() === opsAddress.toLowerCase() &&
    receipt.maxNativeValue === 0n &&
    receipt.recipient === undefined &&
    receipt.unknownCaveats.length === 0;
  record("receipt decoded from the signed allowance matches its terms", "pass", ok, {
    detail: JSON.stringify(receipt, (_, value) => (typeof value === "bigint" ? value.toString() : value)),
  });
}
const before = await balanceOf(user.address);
let r = await opsCall(encodeRedeemTransfer(network, allowance, { token, to: recipientA, amount: usdc("0.2") }));
record("agent sends 0.2 USDC to A inside the allowance", "pass", r.ok, r);
r = await opsCall(encodeRedeemTransfer(network, allowance, { token, to: recipientB, amount: usdc("0.3") }));
record("agent sends 0.3 USDC to B (reaches the cap)", "pass", r.ok, r);
r = await opsCall(encodeRedeemTransfer(network, allowance, { token, to: recipientA, amount: usdc("0.01") }));
record("agent sends 0.01 USDC over the cap", "fail", !r.ok, r);
record("the wallet's balance fell by exactly the cap", "pass", before - (await balanceOf(user.address)) === usdc("0.5"));

// 4. An automation grant: pinned to one recipient.
const automationUnsigned = buildAutomationGrant({ ...terms, amountPerPeriod: usdc("0.1"), salt: salt(), recipient: recipientA });
const automation = withSignature(automationUnsigned, await user.signTypedData(grantTypedData(network, automationUnsigned)));
record(
  "receipt of the automation grant shows the pinned recipient",
  "pass",
  describeGrant(network, automation).recipient?.toLowerCase() === recipientA.toLowerCase(),
);
r = await opsCall(encodeRedeemTransfer(network, automation, { token, to: recipientA, amount: usdc("0.1") }));
record("automation pays its pinned recipient", "pass", r.ok, r);
r = await opsCall(encodeRedeemTransfer(network, automation, { token, to: recipientB, amount: usdc("0.01") }));
record("automation grant used for another recipient", "fail", !r.ok, r);

// 5. A grant changed after signing (a bigger cap with the old signature) is worthless.
{
  const bigger = buildAllowanceGrant({ ...terms, amountPerPeriod: usdc("50"), salt: allowanceUnsigned.salt });
  const forged = withSignature(bigger, allowance.signature);
  r = await opsCall(encodeRedeemTransfer(network, forged, { token, to: recipientA, amount: usdc("0.05") }));
  record("grant edited after signing (cap raised to 50)", "fail", !r.ok, r);
}

// 6. Revoke: one ordinary transaction from the wallet, then wait for a fresh period so only the revoke can stop the agent.
{
  const revoke = encodeRevoke(network, allowance);
  const hash = await userWallet.sendTransaction({ to: revoke.to, data: revoke.data });
  const receipt = await client.waitForTransactionReceipt({ hash });
  record("user revokes the allowance with one transaction", "pass", receipt.status === "success", { tx: hash });
  await new Promise((resolve) => setTimeout(resolve, (PERIOD_SECONDS + PERIOD_MARGIN_SECONDS) * MS_PER_SECOND));
  r = await opsCall(encodeRedeemTransfer(network, allowance, { token, to: recipientA, amount: usdc("0.05") }));
  record("agent uses the revoked allowance in a new period", "fail", !r.ok, r);
}

// 7. Give the unspent testnet USDC back to the ops wallet, so repeated runs do not drain it.
{
  const left = await balanceOf(user.address);
  const reserve = usdc(SWEEP_GAS_RESERVE_USDC);
  if (left > reserve) {
    const { encodeFunctionData } = await import("viem");
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [opsAddress, left - reserve] });
    const hash = await userWallet.sendTransaction({ to: token, data });
    await client.waitForTransactionReceipt({ hash });
    console.log("swept the leftover back to the ops wallet", hash);
  }
}

const passed = results.filter((result) => result.ok).length;
console.log(`\n${passed}/${results.length} as expected`);
writeFileSync(
  new URL("./results.arc-testnet.json", import.meta.url),
  JSON.stringify({ at: new Date().toISOString(), user: user.address, results }, null, 2),
);
process.exit(passed === results.length ? 0 : 1);
