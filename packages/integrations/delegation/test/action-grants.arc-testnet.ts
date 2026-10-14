// Budget acceptance on Arc testnet (D38, Stage 2): the engine behind "no Face ID inside the budget", run on a real
// chain through this package's own builders and the phone's own checks, with a fresh local key standing in for the
// person's wallet. The person never sends a transaction for (1)–(4): the phone only signs typed data, which the phone
// checks first (@kawase/wallet flow-checks), and Kawase's ops wallet (the Circle developer-controlled wallet the api
// uses) redeems.
//   (1) USDC→EURC through a swap leaf pair (Circle App Kit's adapter), redeemed by ops: EURC up by at least minOut.
//   (2) A redirected output (venue calldata built to pay someone else) reverts on chain: ERC20BalanceChange.
//   (3) A too-small output (minOut above what the venue delivers) reverts on chain: ERC20BalanceChange.
//   (4) A per-contact send grant pays the pinned contact and refuses another address.
//   (5) `incrementNonce` from the wallet kills every grant signed at the old nonce (the send grant, a fresh leaf).
// Reverts are mined on chain with a raw-key redeemer (Kawase's relayer stands in for ops; Circle refuses to broadcast
// a transaction whose estimate fails, so its refusal is shown as the eth_call revert reason instead).
// Needs CIRCLE_TEST_API_KEY, CIRCLE_TEST_ENTITY_SECRET, OPS_WALLET_ID_TESTNET, OPS_WALLET_ADDRESS_TESTNET and
// RELAYER_PRIVATE_KEY_TESTNET in the repo .env. Run from packages/integrations/delegation: npx tsx test/action-grants.arc-testnet.ts
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import type { Delegation } from "@metamask/smart-accounts-kit";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, formatUnits, http, parseUnits, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getNetwork } from "@kawase/networks";
import { checkContactGrant, checkRevoke, checkSwapLeaves, localKeySigner } from "@kawase/wallet";

// App Kit is the only swap venue on Arc testnet; its source is read straight from the sibling package (a test-only
// import, so the delegation package takes no dependency on it).
import { prepareSwap, quoteSwap } from "../../app-kit/src/index.ts";
import {
  buildContactSendGrants,
  buildSwapLeaves,
  describeGrant,
  encodeIncrementNonce,
  encodeRedeemLeaves,
  encodeRedeemTransfer,
  encodeSelfBatch,
  grantTypedData,
  isWalletSetUp,
  randomSalt,
  readGrantNonce,
  setupAuthorizationRequest,
  withSignature,
  type LeafStep,
} from "../src/index.ts";

config({ path: new URL("../../../../.env", import.meta.url).pathname, quiet: true });

const RPC_URL = process.env.ARC_RPC_URL_TESTNET ?? "https://rpc.testnet.arc.network";
const DECIMALS = 6;
const FUNDING_USDC = "1.2";
const SWAP_USDC = "0.3";
const SMALL_SWAP_USDC = "0.1";
const SLIPPAGE_BPS = 100;
const PERIOD_SECONDS = 3600;
const GRANT_TTL_SECONDS = 7 * 86_400;
const CONTACT_CAP_USDC = "0.2";
const POLL_MS = 2000;
const POLL_ATTEMPTS = 90;
/** A mined revert needs a gas limit that skips the node's estimate (which would refuse it first). */
const FORCED_GAS = 1_500_000n;
const SWEEP_RESERVE_USDC = "0.02";
const usdc = (amount: string) => parseUnits(amount, DECIMALS);

const opsWalletId = process.env.OPS_WALLET_ID_TESTNET;
const opsAddress = process.env.OPS_WALLET_ADDRESS_TESTNET as Address | undefined;
const relayerKey = process.env.RELAYER_PRIVATE_KEY_TESTNET as Hex | undefined;
const apiKey = process.env.CIRCLE_TEST_API_KEY;
if (!opsWalletId || !opsAddress || !relayerKey || !apiKey || !process.env.CIRCLE_TEST_ENTITY_SECRET) throw new Error("Missing the testnet ops wallet, relayer key or Circle test keys (see the header)");

const network = getNetwork("testnet");
const { usdc: USDC, eurc: EURC } = network.addresses;
const chain = network.viemChain;
const EXPLORER_TX = `${chain.blockExplorers?.default.url ?? ""}/tx/`;
const transport = http(RPC_URL);
const client = createPublicClient({ chain, transport });
const circle = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret: process.env.CIRCLE_TEST_ENTITY_SECRET });

const user = localKeySigner(generatePrivateKey());
const userWallet = createWalletClient({ account: user, chain, transport });
const relayerAccount = privateKeyToAccount(relayerKey.startsWith("0x") ? relayerKey : (`0x${relayerKey}` as Hex));
const relayer = createWalletClient({ account: relayerAccount, chain, transport });
const contact = privateKeyToAccount(generatePrivateKey()).address;
const stranger = privateKeyToAccount(generatePrivateKey()).address;

type Result = { name: string; expected: "pass" | "fail"; ok: boolean; tx?: string | undefined; detail?: string | undefined };
const results: Result[] = [];
function record(name: string, expected: "pass" | "fail", ok: boolean, extra: { tx?: string | undefined; detail?: string | undefined } = {}) {
  results.push({ name, expected, ok, tx: extra.tx, detail: extra.detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} (expected ${expected})`, extra.tx ? EXPLORER_TX + extra.tx : "", extra.detail ?? "");
}

const balanceOf = (token: Address, owner: Address) => client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
const nowS = async () => Number((await client.getBlock()).timestamp);
const sign = async (leaf: Delegation) => withSignature(leaf, await user.signTypedData(grantTypedData(network, leaf)));

async function waitForCircle(id: string) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const transaction = (await circle.getTransaction({ id })).data?.transaction;
    if (transaction && ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"].includes(transaction.state)) return transaction;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`Timed out waiting for Circle transaction ${id}`);
}

/** Kawase's ops wallet (Circle) sends a contract call, as the api does. */
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

/** Why the chain refuses a call from `from`, read with eth_call (the enforcer's revert string), or "" when it would pass. */
async function revertReason(from: Address, call: { to: Address; data: Hex }) {
  try {
    await client.call({ account: from, to: call.to, data: call.data });
    return "";
  } catch (error) {
    const text = `${(error as { details?: string }).details ?? ""} ${(error as Error).message}`;
    return text.match(/[A-Za-z0-9]+Enforcer:[a-z-]+/)?.[0] ?? text.match(/reverted[^\n]*/)?.[0] ?? text.slice(0, 160);
  }
}

/** The relayer sends a redeem with a fixed gas limit, so a refused one is mined as a revert. */
async function minedRedeem(call: { to: Address; data: Hex }) {
  const hash = await relayer.sendTransaction({ to: call.to, data: call.data, gas: FORCED_GAS });
  const receipt = await client.waitForTransactionReceipt({ hash });
  return { hash, status: receipt.status };
}

/** A fresh App Kit route for `amount` USDC→EURC, built to pay `beneficiary`: the quote and the adapter call. */
async function route(amount: string, beneficiary: Address) {
  const input = { network, client: client as never, apiKey: apiKey as string, from: beneficiary, tokenIn: USDC, tokenOut: EURC, amountIn: amount, slippageBps: SLIPPAGE_BPS };
  const quote = await quoteSwap({ ...input, decimalsOut: DECIMALS });
  const calls = await prepareSwap(input);
  const swap = calls[calls.length - 1]!;
  return { quote, router: swap.to, routerCalldata: swap.data };
}

console.log("user", user.address, "| ops", opsAddress, "| relayer", relayerAccount.address, "| contact", contact);

// 0. Setup: the relayer sends the 7702 authorization; Kawase's ops wallet funds the empty wallet.
{
  const accountNonce = await client.getTransactionCount({ address: user.address });
  const authorization = await user.signAuthorization(setupAuthorizationRequest(network, accountNonce));
  const hash = await relayer.sendTransaction({ authorizationList: [authorization], to: user.address, data: "0x" });
  const receipt = await client.waitForTransactionReceipt({ hash });
  record("relayed EIP-7702 setup", "pass", receipt.status === "success" && isWalletSetUp(await client.getCode({ address: user.address })), { tx: hash });
  const created = await circle.createTransaction({
    walletAddress: opsAddress,
    blockchain: "ARC-TESTNET",
    tokenAddress: USDC,
    destinationAddress: user.address,
    amount: [FUNDING_USDC],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  });
  const funded = await waitForCircle(created.data?.id ?? "");
  record(`ops funds the wallet with ${FUNDING_USDC} USDC`, "pass", funded.state === "COMPLETE", { tx: funded.txHash });
}

const nonce = await readGrantNonce(client, network, user.address);
console.log("kill-switch nonce", nonce);

// (1) A swap through a leaf pair, redeemed by ops, with no prompt: the phone checks the leaves against its own quote.
let leftoverLeaf: LeafStep[] | undefined;
{
  const amountIn = usdc(SWAP_USDC);
  const { quote, router, routerCalldata } = await route(SWAP_USDC, user.address);
  const now = await nowS();
  const leaves = buildSwapLeaves({ network, wallet: user.address, ops: opsAddress, router, tokenIn: USDC, tokenOut: EURC, amountIn, minOut: quote.minOut, routerCalldata, nonce, now, salts: [randomSalt(), randomSalt()] });
  // The phone: decode both leaves and compare with what it expects on its own, before it signs.
  let phone = "";
  try {
    const typed = [grantTypedData(network, leaves.approveLeaf), grantTypedData(network, leaves.swapLeaf)] as const;
    const checked = checkSwapLeaves(typed as never, { wallet: user.address, ops: opsAddress, now, nonce, routers: [router], tokenIn: USDC, tokenOut: EURC, amountIn, minOut: quote.minOut });
    phone = `guaranteed ${formatUnits(checked.guaranteedOut, DECIMALS)} EURC`;
  } catch (error) {
    phone = String(error);
  }
  record("phone checks the swap leaves against its own quote", "pass", phone.startsWith("guaranteed"), { detail: phone });
  const signed: LeafStep[] = [
    { ...leaves.steps[0], grant: await sign(leaves.approveLeaf) },
    { ...leaves.steps[1], grant: await sign(leaves.swapLeaf) },
  ];
  const receipt = describeGrant(network, signed[1]!.grant);
  record("the signed swap leaf decodes to its guarantees", "pass", receipt.unknownCaveats.length === 0 && receipt.balanceChanges.length === 2 && receipt.nonce !== undefined && receipt.maxCalls === 1, {
    detail: JSON.stringify(receipt.balanceChanges, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  });
  const [eurcBefore, usdcBefore] = await Promise.all([balanceOf(EURC, user.address), balanceOf(USDC, user.address)]);
  const r = await opsCall(encodeRedeemLeaves(network, signed));
  const [eurcAfter, usdcAfter] = await Promise.all([balanceOf(EURC, user.address), balanceOf(USDC, user.address)]);
  const gained = eurcAfter - eurcBefore;
  const spent = usdcBefore - usdcAfter;
  record("(1) USDC→EURC through the leaf pair, redeemed by ops, no prompt", "pass", r.ok && gained >= quote.minOut && spent <= amountIn, {
    tx: r.tx,
    detail: `${r.detail ?? ""} spent ${formatUnits(spent, DECIMALS)} USDC, got ${formatUnits(gained, DECIMALS)} EURC (min ${formatUnits(quote.minOut, DECIMALS)})`.trim(),
  });
  const replay = await revertReason(opsAddress, encodeRedeemLeaves(network, signed));
  record("the same leaves cannot be redeemed twice", "fail", replay !== "", { detail: replay });
}

// (2) A redirected output: the venue's calldata pays the redeemer instead of the wallet. Without the leaf the calls
// would run (the wallet's own eth_call proves it); under the leaf the chain refuses them.
{
  const amountIn = usdc(SMALL_SWAP_USDC);
  const ownRoute = await route(SMALL_SWAP_USDC, user.address);
  const theft = await route(SMALL_SWAP_USDC, relayerAccount.address);
  const now = await nowS();
  const leaves = buildSwapLeaves({ network, wallet: user.address, ops: relayerAccount.address, router: theft.router, tokenIn: USDC, tokenOut: EURC, amountIn, minOut: ownRoute.quote.minOut, routerCalldata: theft.routerCalldata, nonce, now, salts: [randomSalt(), randomSalt()] });
  const control = await revertReason(user.address, { to: user.address, data: encodeSelfBatch([{ to: leaves.steps[0].target, data: leaves.steps[0].callData }, { to: theft.router, data: theft.routerCalldata }]) });
  record("control: the redirected calls run when the wallet sends them itself", "pass", control === "", { detail: control || "eth_call succeeds, output to the redeemer" });
  const call = encodeRedeemLeaves(network, [
    { ...leaves.steps[0], grant: await sign(leaves.approveLeaf) },
    { ...leaves.steps[1], grant: await sign(leaves.swapLeaf) },
  ]);
  const reason = await revertReason(relayerAccount.address, call);
  const eurcBefore = await balanceOf(EURC, relayerAccount.address);
  const mined = await minedRedeem(call);
  const eurcAfter = await balanceOf(EURC, relayerAccount.address);
  record("(2) a redirected output reverts on chain", "fail", mined.status === "reverted" && eurcAfter === eurcBefore, { tx: mined.hash, detail: reason });
}

// (3) Too small an output: the leaf asks for more EURC than the venue delivers.
{
  const amountIn = usdc(SMALL_SWAP_USDC);
  const { quote, router, routerCalldata } = await route(SMALL_SWAP_USDC, user.address);
  const greedy = quote.estimatedOut * 2n;
  const now = await nowS();
  const leaves = buildSwapLeaves({ network, wallet: user.address, ops: relayerAccount.address, router, tokenIn: USDC, tokenOut: EURC, amountIn, minOut: greedy, routerCalldata, nonce, now, salts: [randomSalt(), randomSalt()] });
  const call = encodeRedeemLeaves(network, [
    { ...leaves.steps[0], grant: await sign(leaves.approveLeaf) },
    { ...leaves.steps[1], grant: await sign(leaves.swapLeaf) },
  ]);
  const reason = await revertReason(relayerAccount.address, call);
  const usdcBefore = await balanceOf(USDC, user.address);
  const mined = await minedRedeem(call);
  const usdcAfter = await balanceOf(USDC, user.address);
  record("(3) a too-small output reverts on chain", "fail", mined.status === "reverted" && usdcAfter === usdcBefore, { tx: mined.hash, detail: `${reason} (asked ≥ ${formatUnits(greedy, DECIMALS)} EURC)` });
}

// (4) A per-contact send grant: pays the pinned contact, refuses anyone else.
const now4 = await nowS();
const [contactGrantUnsigned] = buildContactSendGrants({
  network,
  wallet: user.address,
  redeemer: opsAddress,
  token: USDC,
  amountPerPeriod: usdc(CONTACT_CAP_USDC),
  periodSeconds: PERIOD_SECONDS,
  startsAt: now4 - 5,
  expiresAt: now4 + GRANT_TTL_SECONDS,
  nonce,
  contacts: [{ address: contact, salt: randomSalt() }],
});
{
  let phone = "ok";
  try {
    checkContactGrant(grantTypedData(network, contactGrantUnsigned!) as never, { wallet: user.address, ops: opsAddress, token: USDC, recipient: contact, maxPerPeriod: usdc(CONTACT_CAP_USDC), nonce });
  } catch (error) {
    phone = String(error);
  }
  record("phone checks the contact grant (pinned recipient, kill-switch)", "pass", phone === "ok", { detail: phone });
}
const contactGrant = await sign(contactGrantUnsigned!);
{
  const before = await balanceOf(USDC, contact);
  const r = await opsCall(encodeRedeemTransfer(network, contactGrant, { token: USDC, to: contact, amount: usdc("0.05") }));
  const after = await balanceOf(USDC, contact);
  record("(4) ops pays the pinned contact under the grant", "pass", r.ok && after - before === usdc("0.05"), { tx: r.tx, detail: r.detail });
  const toStranger = encodeRedeemTransfer(network, contactGrant, { token: USDC, to: stranger, amount: usdc("0.01") });
  const reason = await revertReason(opsAddress, toStranger);
  const refused = await opsCall(toStranger);
  record("(4) the same grant refuses another address", "fail", !refused.ok && reason !== "" && (await balanceOf(USDC, stranger)) === 0n, { detail: `${reason} | ops: ${refused.detail ?? ""}` });
}

// A leaf signed at the current nonce, kept unredeemed to show (5) kills it too.
{
  const { quote, router, routerCalldata } = await route(SMALL_SWAP_USDC, user.address);
  const leaves = buildSwapLeaves({ network, wallet: user.address, ops: relayerAccount.address, router, tokenIn: USDC, tokenOut: EURC, amountIn: usdc(SMALL_SWAP_USDC), minOut: quote.minOut, routerCalldata, nonce, now: await nowS(), salts: [randomSalt(), randomSalt()] });
  leftoverLeaf = [
    { ...leaves.steps[0], grant: await sign(leaves.approveLeaf) },
    { ...leaves.steps[1], grant: await sign(leaves.swapLeaf) },
  ];
  const before = await revertReason(relayerAccount.address, encodeRedeemLeaves(network, leftoverLeaf));
  record("control: a fresh leaf at the current nonce would redeem", "pass", before === "", { detail: before || "eth_call succeeds" });
}

// (5) The kill-switch: one transaction from the wallet; every grant at the old nonce is dead.
{
  const kill = encodeIncrementNonce(network);
  let phone = "ok";
  try {
    checkRevoke({ transaction: { to: kill.to, data: kill.data, value: "0", chainId: network.chainId } }, user.address);
  } catch (error) {
    phone = String(error);
  }
  record("phone accepts incrementNonce as a revoke (no Face ID needed)", "pass", phone === "ok", { detail: phone });
  const hash = await userWallet.sendTransaction({ to: kill.to, data: kill.data });
  const receipt = await client.waitForTransactionReceipt({ hash });
  const after = await readGrantNonce(client, network, user.address);
  record("(5) the wallet sends incrementNonce", "pass", receipt.status === "success" && after === nonce + 1n, { tx: hash, detail: `nonce ${nonce} → ${after}` });

  const toContact = encodeRedeemTransfer(network, contactGrant, { token: USDC, to: contact, amount: usdc("0.05") });
  const reason = await revertReason(opsAddress, toContact);
  const r = await opsCall(toContact);
  record("(5) the contact grant is dead after the kill-switch", "fail", !r.ok && /Nonce/.test(reason), { detail: `${reason} | ops: ${r.detail ?? ""}` });

  const leafCall = encodeRedeemLeaves(network, leftoverLeaf);
  const leafReason = await revertReason(relayerAccount.address, leafCall);
  const mined = await minedRedeem(leafCall);
  record("(5) a leaf signed before the kill-switch reverts on chain", "fail", mined.status === "reverted" && /Nonce/.test(leafReason), { tx: mined.hash, detail: leafReason });
}

// Give the testnet USDC and EURC back to the ops wallet, so repeated runs do not drain it.
{
  const eurc = await balanceOf(EURC, user.address);
  if (eurc > 0n) await client.waitForTransactionReceipt({ hash: await userWallet.writeContract({ address: EURC, abi: erc20Abi, functionName: "transfer", args: [opsAddress, eurc] }) });
  const left = await balanceOf(USDC, user.address);
  const reserve = usdc(SWEEP_RESERVE_USDC);
  if (left > reserve) await client.waitForTransactionReceipt({ hash: await userWallet.writeContract({ address: USDC, abi: erc20Abi, functionName: "transfer", args: [opsAddress, left - reserve] }) });
  console.log("swept the leftovers back to the ops wallet");
}

const passed = results.filter((result) => result.ok).length;
console.log(`\n${passed}/${results.length} as expected`);
writeFileSync(
  new URL("./results.action-grants.arc-testnet.json", import.meta.url),
  JSON.stringify({ at: new Date(Date.now()).toISOString(), user: user.address, ops: opsAddress, relayer: relayerAccount.address, contact, results }, null, 2),
);
process.exit(passed === results.length ? 0 : 1);
