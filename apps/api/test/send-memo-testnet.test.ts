// Send with an on-chain reference (Arc Memo), on Arc testnet: the payer — a Kawase wallet (an EOA with EIP-7702 code) —
// scans an EIP-681 link that carries an order reference (memo text and its bytes32 memoId) and pays it from Kawase: the
// send carries the reference by itself, goes through Memo (never the allowance), and the receipt carries the Memo event
// with the memoId and the wallet as sender. Skipped without the server keys in the root .env.
// Run: pnpm --filter @kawase/api exec tsx --test test/send-memo-testnet.test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, http, keccak256, parseAbi, parseEventLogs, parseUnits, stringToHex, type Hex, type TransactionSerializable } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { PayCodeView, SendApproveResponse, SendIntent } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { parsePayCode } from "../src/paycodes/parse";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, jsonRequest, privyPerson, privySignIn, testApp } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 3000;
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const FINAL = ["completed", "failed", "canceled", "expired", "rejected"];
const SIX = 6;
const units = (value: string) => parseUnits(value, SIX);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MEMO_EVENT = parseAbi(["event Memo(address indexed sender, address indexed target, bytes32 callDataHash, bytes32 indexed memoId, bytes memo, uint256 memoIndex)"]);

test("send with an on-chain reference carries its memoId through Arc's Memo contract", { skip: !live, timeout: 600_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const network = getNetwork("testnet");
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  const receiver = privateKeyToAccount(generatePrivateKey());
  const payer = privateKeyToAccount(generatePrivateKey());
  const payerSigner = createWalletClient({ account: payer, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const people = [{ account: payer, name: "payer", privy: privyPerson(`payer-${randomUUID()}@example.test`, payer.address) }];
  const { app, db, close } = testApp(chains);
  const userIds: string[] = [];
  after(async () => {
    for (const token of [network.addresses.eurc, network.addresses.usdc]) {
      const left = await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [payer.address] });
      const keep = token === network.addresses.usdc ? units("0.02") : 0n;
      if (left > keep) await client.waitForTransactionReceipt({ hash: await payerSigner.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - keep] }) });
    }
    for (const id of userIds) await deleteUser(db, id);
    await close();
  });

  const signIn = async (person: (typeof people)[number]) => {
    const response = await privySignIn(app, person.privy, { platform: "ios", installationId: `memo-${person.name}-0001` });
    await expectStatus(response, 201, "sign-in");
    const { token, user } = (await response.json()) as { token: string; user: { id: string } };
    userIds.push(user.id);
    const call = (method: string, path: string, payload?: unknown) =>
      app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
    const { authorization } = (await (await call("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
    const auth = await person.account.signAuthorization(authorization);
    await expectStatus(await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: auth.address, chainId: auth.chainId, nonce: auth.nonce, r: auth.r, s: auth.s, yParity: auth.yParity } }), 200, "setup");
    return call;
  };
  const pay = await signIn(people[0]!);
  for (const [tokenAddress, amount] of [[network.addresses.usdc, "0.2"], [network.addresses.eurc, "0.15"]] as const) {
    const drip = await circle.createTransaction({ walletAddress: env.OPS_WALLET_ADDRESS_TESTNET, blockchain: network.circleBlockchain, tokenAddress, destinationAddress: payer.address, amount: [amount], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
      if (DONE_STATES.includes(state)) break;
      await wait(POLL_MS);
    }
  }

  // An EIP-681 link carries a reference (memo text and its bytes32 id): 0.1 EURC for order ORDER-0001.
  const reference = { memo: "ORDER-0001", memoId: keccak256(stringToHex("kawase:test:order-0001")) };
  const link = `ethereum:${network.addresses.eurc}@${network.chainId}/transfer?address=${receiver.address}&uint256=100000&memo=${reference.memo}&memoId=${reference.memoId}`;
  const parsed = parsePayCode(link, [], () => SIX);
  assert.equal(parsed.kind === "address" && parsed.memo, reference.memo);
  assert.equal(parsed.kind === "address" && parsed.memoId, reference.memoId.toLowerCase());

  // The payer scans the link: it resolves to a send that carries the reference.
  const code = (await (await pay("POST", "/pay-codes/resolve", { code: link })).json()) as PayCodeView;
  assert.equal(code.status, "send", JSON.stringify(code));
  if (code.status !== "send") return;
  assert.equal(code.memoId, reference.memoId.toLowerCase());
  const send = ((await (await pay("POST", "/sends", { recipient: code.to, amount: code.amount, asset: code.asset, memo: code.memo, memoId: code.memoId })).json()) as { intent: SendIntent }).intent;
  assert.equal(send.blocking, null, JSON.stringify(send.results));
  assert.equal(send.route, "wallet_signature", "a reference never rides the allowance");
  assert.equal(send.draft?.memo?.memoData, reference.memo);
  // Paying most of the balance to a new address trips the Brake (A3): the person confirms the override on the card.
  const sign = (await (await pay("POST", `/sends/${send.id}/approve`, { version: send.version, override: true })).json()) as SendApproveResponse;
  assert.equal(sign.status, "sign", JSON.stringify(sign));
  if (sign.status !== "sign") return;
  assert.equal(sign.transaction.to.toLowerCase(), network.addresses.memo.toLowerCase(), "the wallet calls Arc's Memo contract");
  const t = sign.transaction;
  const unsigned: TransactionSerializable = { type: "eip1559", chainId: t.chainId, nonce: t.nonce, to: t.to as Hex, data: t.data as Hex, value: BigInt(t.value), gas: BigInt(t.gas), maxFeePerGas: BigInt(t.maxFeePerGas), maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas) };
  await expectStatus(await pay("POST", `/sends/${send.id}/signature`, { approvalId: sign.approvalId, signedTransaction: await payer.signTransaction(unsigned) }), 200, "signature");
  let done: SendIntent | undefined;
  for (let attempt = 0; attempt < POLL_ATTEMPTS && !FINAL.includes(done?.state ?? ""); attempt++) {
    await wait(POLL_MS);
    done = ((await (await pay("GET", `/sends/${send.id}`)).json()) as { intent: SendIntent }).intent;
  }
  assert.equal(done?.state, "completed", JSON.stringify(done));
  const receipt = await client.getTransactionReceipt({ hash: done!.tx!.hash as Hex });
  const memos = parseEventLogs({ abi: MEMO_EVENT, logs: receipt.logs });
  assert.equal(memos[0]?.args.memoId.toLowerCase(), reference.memoId.toLowerCase(), "the Memo event names the reference");
  assert.equal(memos[0]?.args.sender.toLowerCase(), payer.address.toLowerCase(), "the Kawase wallet itself is the sender");
  console.log("paid by reference", done?.tx?.explorerUrl);
});
