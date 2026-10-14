// Aero LP + Merkl on Arc mainnet state, simulated (nothing is sent): the real LpService against the acceptance shadow
// chain (acceptance/shadow-chain.ts: every read on mainnet state, every transaction simulated and folded in). A fresh
// wallet (7702 DeleGator code, 20 USDC) deposits 4 USDC into each of USDC-EURC, cirBTC-USDC and WETH-USDC: quoted,
// built (the KyberSwap leg for the other side checked), simulated, signed by the wallet and sent as one batch each.
// Each position must then read back in range and worth about what went in; one is withdrawn in one batch (the NFT
// burnt, both sides back in the wallet). Practice mode builds nothing. Merkl: a claim for a real holder of rewards,
// encoded by LpService's claim call, pays exactly what Merkl says is claimable. The WalletService double only signs
// and sends (what WalletService.selfBatchRequest and submitTransaction do, without a database).
// Run: tsx test/aero-lp.sim.ts
import assert from "node:assert/strict";
import { createPublicClient, createWalletClient, decodeFunctionResult, encodeFunctionData, erc20Abi, formatUnits, http, numberToHex, parseUnits, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { arc } from "viem/chains";

import type { TransactionRequestResponse } from "@kawase/api-client";
import { AERO_LP } from "@kawase/config";
import { encodeSelfBatch } from "@kawase/integrations-delegation";
import { createLogger } from "@kawase/log";
import { DELEGATION_FRAMEWORK, getNetwork } from "@kawase/networks";

import { claimCall } from "../src/lp/aero";
import { LpService } from "../src/lp/service";
import type { SessionUser } from "../src/types";
import type { Chains, NetworkClients } from "../src/wallet/chain";
import type { WalletService } from "../src/wallet/service";
import { ShadowChain } from "./acceptance/shadow-chain";

const UPSTREAM = "https://rpc.drpc.mainnet.arc.io";
const MERKL_USERS = "https://api.merkl.xyz/v4/users";
/** A real wallet with unclaimed Merkl USDC on Arc (an Aero LP; read from Merkl's API 10-03). */
const REWARD_HOLDERS: Address[] = ["0xd9092896653042eC60941a6fE1B2c85B7DC5000b", "0x8C60d785A9f3905965405CeBAcF8FEA6010833D2", "0xD7072DaE05277971B7A6a939eD9aD4967Fab3E05"];
const FUNDING = parseUnits("20", 18);
const DEPOSIT = "4";
const USDC = "0x3600000000000000000000000000000000000000" as Address;
const USDC_DECIMALS = 6;
/** A position reads back within this share of what went in (the swap's price impact, the rest left in the wallet). */
const VALUE_TOLERANCE = 0.1;
const designator = `0xef0100${DELEGATION_FRAMEWORK.eip7702StatelessDeleGator.slice(2)}` as Hex;

const chain = new ShadowChain(UPSTREAM);
const url = await chain.start();
const account = privateKeyToAccount(generatePrivateKey());
const wallet = account.address;
chain.setCode(wallet, designator);
chain.setNative(wallet, FUNDING);
const network = getNetwork("mainnet");
const client = createPublicClient({ chain: arc, transport: http(url, { timeout: 120_000 }) });
const clients: NetworkClients = { network, client: client as never, relayer: createWalletClient({ account, chain: arc, transport: http(url) }), relayerAddress: wallet, ops: { walletId: "none", address: wallet } };
const chains: Chains = { available: ["mainnet"], get: (id) => (id === "mainnet" ? clients : undefined) };

// What WalletService does for these two calls, without a database: hand out the self-batch, then send it signed.
const pending = new Map<string, { data: Hex; gas: bigint }>();
const wallets = {
  userWallet: async () => ({ id: "sim", address: wallet }),
  selfBatchRequest: async (_userId: string, _network: string, _kind: string, calls: { to: Address; data: Hex }[], gas: bigint): Promise<TransactionRequestResponse> => {
    const data = encodeSelfBatch(calls.map((call) => ({ ...call, value: 0n })));
    const [nonce, fees] = await Promise.all([client.getTransactionCount({ address: wallet }), client.estimateFeesPerGas()]);
    const requestId = crypto.randomUUID();
    pending.set(requestId, { data, gas });
    return { requestId, transaction: { type: "eip1559", chainId: arc.id, nonce, to: wallet, data, value: "0", gas: gas.toString(), maxFeePerGas: fees.maxFeePerGas.toString(), maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString() } };
  },
  submitTransaction: async (_userId: string, requestId: string, signed: Hex) => {
    assert.ok(pending.delete(requestId), "an unknown request");
    const hash = await client.sendRawTransaction({ serializedTransaction: signed });
    const receipt = await client.waitForTransactionReceipt({ hash });
    return { tx: hash, status: receipt.status === "success" ? "confirmed" : "reverted" };
  },
} as unknown as WalletService;

const lp = new LpService(chains, wallets, createLogger({ service: "aero-lp-sim", level: "warn" }));
const user = { id: "sim", activeNetwork: "mainnet", practiceMode: false } as SessionUser;

async function sign(request: TransactionRequestResponse): Promise<Hex> {
  const tx = request.transaction;
  return account.signTransaction({ type: "eip1559", chainId: tx.chainId, nonce: tx.nonce, to: tx.to as Address, data: tx.data as Hex, value: 0n, gas: BigInt(tx.gas), maxFeePerGas: BigInt(tx.maxFeePerGas), maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas) });
}
const usdcBalance = async () => client.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [wallet] });

try {
  // Practice mode never touches real money.
  await assert.rejects(lp.deposit({ ...user, practiceMode: true }, { pool: "USDC-EURC", asset: "USDC", amount: DEPOSIT }), /practice mode/);

  for (const config of AERO_LP.pools) {
    const quote = await lp.quote(user, { pool: config.pair, asset: "USDC", amount: DEPOSIT });
    assert.equal(quote.reason, null, `${config.pair}: ${quote.reason}`);
    const before = await usdcBalance();
    const { request } = await lp.deposit(user, { pool: config.pair, asset: "USDC", amount: DEPOSIT });
    const sent = await lp.submit(user, request.requestId, await sign(request));
    assert.equal(sent.status, "confirmed", `${config.pair} deposit: ${chain.sent.find((tx) => tx.hash === sent.tx)?.error ?? ""}`);
    const spent = Number(formatUnits(before - (await usdcBalance()), USDC_DECIMALS));
    const swap = quote.swap ? `${formatUnits(BigInt(quote.swap.amountIn), quote.swap.decimalsIn)} ${quote.swap.symbolIn} → ≥${formatUnits(BigInt(quote.swap.minOut), quote.swap.decimalsOut)} ${quote.swap.symbolOut} via ${quote.swap.venues.join(",")}` : "no swap";
    console.log(`${config.pair}: ${quote.pool.base} ${quote.range.price.toPrecision(6)} in range ${quote.range.lower.toPrecision(6)}–${quote.range.upper.toPrecision(6)}; ${swap}; deposited in one batch (${sent.tx.slice(0, 10)}…), USDC spent ${spent.toFixed(4)} (gas included); rewards ${((quote.pool.rewardApr ?? 0) * 100).toFixed(1)}% APR`);
  }

  const view = await lp.positions(user);
  assert.equal(view.positions.length, AERO_LP.pools.length, JSON.stringify(view.positions.map((p) => p.pool.pair)));
  for (const position of view.positions) {
    assert.ok(position.inRange, `${position.pool.pair} is out of range right after the deposit`);
    assert.ok(Math.abs(position.valueUsd - Number(DEPOSIT)) / Number(DEPOSIT) < VALUE_TOLERANCE, `${position.pool.pair} reads $${position.valueUsd.toFixed(4)} for a $${DEPOSIT} deposit`);
    console.log(`  position #${position.id} ${position.pool.pair}: $${position.valueUsd.toFixed(4)}, in range`);
  }

  // Withdraw one: both sides back, the NFT burnt.
  const out = view.positions.find((position) => position.pool.pair === "cirBTC-USDC")!;
  const before = await usdcBalance();
  const { request } = await lp.withdraw(user, out.id);
  const sent = await lp.submit(user, request.requestId, await sign(request));
  assert.equal(sent.status, "confirmed", `withdraw: ${chain.sent.find((tx) => tx.hash === sent.tx)?.error ?? ""}`);
  const after = await lp.positions(user);
  assert.ok(!after.positions.some((position) => position.id === out.id), "the withdrawn position still reads");
  const cirBtc = await client.readContract({ address: out.pool.token0.address as Address, abi: erc20Abi, functionName: "balanceOf", args: [wallet] });
  console.log(`withdrew #${out.id} in one batch: USDC +${formatUnits((await usdcBalance()) - before, USDC_DECIMALS)} (less gas), ${formatUnits(cirBtc, out.pool.token0.decimals)} ${out.pool.token0.symbol} back; ${after.positions.length} positions left`);

  // Nothing to claim for a fresh wallet.
  await assert.rejects(lp.claim(user), /no Merkl rewards/);

  // A real holder's claim, encoded by LpService's claim call, pays what Merkl says is claimable.
  let proven = false;
  for (const holder of REWARD_HOLDERS) {
    const chains = (await (await fetch(`${MERKL_USERS}/${holder}/rewards?chainId=${arc.id}`)).json()) as { chain: { id: number }; rewards: { amount: string; claimed: string; proofs: Hex[]; token: { address: Address } }[] }[];
    const reward = chains.find((entry) => entry.chain.id === arc.id)?.rewards.find((entry) => BigInt(entry.amount) > BigInt(entry.claimed) && entry.proofs.length > 0);
    if (!reward) continue;
    const call = claimCall(holder, [{ token: reward.token.address, amount: BigInt(reward.amount), proofs: reward.proofs }]);
    const balance = { to: reward.token.address, data: encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [holder] }) };
    const result = (await client.request({
      method: "eth_simulateV1" as never,
      params: [{ blockStateCalls: [{ stateOverrides: { [holder]: { balance: numberToHex(FUNDING) } }, calls: [balance, { from: holder, to: call.to, data: call.data }, balance] }] }, "latest"] as never,
    })) as { calls: { status: string; returnData: Hex }[] }[];
    const [first, claimed, last] = result[0]!.calls;
    assert.equal(claimed!.status, "0x1", "the Merkl claim reverted");
    const read = (data: Hex) => decodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", data }) as bigint;
    // USDC on Arc is also the gas token: the simulated call pays no gas, so the balance moves by the claim alone.
    assert.equal(read(last!.returnData) - read(first!.returnData), BigInt(reward.amount) - BigInt(reward.claimed));
    console.log(`Merkl claim for ${holder.slice(0, 10)}…: ${formatUnits(BigInt(reward.amount) - BigInt(reward.claimed), USDC_DECIMALS)} USDC paid, exactly the claimable amount`);
    proven = true;
    break;
  }
  assert.ok(proven, "no holder with claimable Merkl rewards to prove the claim with");
  console.log(`wallet ${wallet}: three Aero positions opened and one closed, each in one batch, on Arc mainnet state`);
} finally {
  await chain.stop();
}
