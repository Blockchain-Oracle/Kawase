// The front door end to end on Arc testnet (Stage 3 acceptance, front-door lane): a signed-in scratch person types
// "swap 2 USDC to EURC" (ONE live agent turn), the race streams its venue rows as preliminary snapshots, the agent
// proposes the trade with the race's pick, the person approves it (a fresh local key stands in for their wallet and
// signs the one transaction the api built), and the receipt lands in GET /feed with its tx hash and venue, and
// GET /feed/item/:id gives back the race it came from. Then the smart sheet's resume, without another model call:
// a send to an unknown name is blocked with RECIPIENT_UNKNOWN; once "Alex" is saved, the SAME send re-checked (the
// phone's controller.revise({})) is no longer blocked by the name.
//
// Costs one OpenAI turn, so it only runs when asked: FRONT_DOOR_LIVE=1, with the testnet relayer, ops wallet, Circle
// test key and OpenAI key in the root .env, against a scratch database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, erc20Abi, http, parseUnits, type Hex, type TransactionSerializable } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { createModels } from "@kawase/agent";
import type { ModelRef } from "@kawase/config";
import type { AgentFeed, AgentFeedDetail, RaceRoutesOutput, SendIntent, SwapApproveResponse, SwapIntent, UnsignedTransaction } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { appKitSwaps } from "../src/swap/engine";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, jsonRequest, privyPerson, privySignIn, testApp } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live =
  process.env.FRONT_DOOR_LIVE === "1" &&
  Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY && process.env.OPENAI_API_KEY);
const POLL_MS = 2000;
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const FINAL = new Set(["completed", "failed", "rejected", "canceled", "expired"]);
const usdc = (value: string) => parseUnits(value, 6);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Chunk = { type: string; toolCallId?: string; toolName?: string; output?: unknown; preliminary?: boolean; delta?: string; errorText?: string };

test("front door on testnet: the race streams, the swap lands, the feed has its receipt and race; a blocked send resumes", { skip: !live, timeout: 900_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const network = getNetwork("testnet");
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const wallet = privateKeyToAccount(generatePrivateKey());
  const TEST_ID = randomUUID();
  const person = privyPerson(`front-door-${TEST_ID}@example.test`, wallet.address);
  const models = createModels(
    { openai: env.OPENAI_API_KEY! },
    env.KAWASE_MODEL_AGENT_CHAT ? { agentChat: env.KAWASE_MODEL_AGENT_CHAT as ModelRef } : {},
  );
  const { app, db, close } = testApp(chains, undefined, undefined, appKitSwaps(env), undefined, undefined, {
    models,
    ...(env.ALCHEMY_API_KEY ? { alchemyApiKey: env.ALCHEMY_API_KEY } : {}),
  });
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  let userId = "";
  after(async () => {
    // What is left goes back to the ops wallet (a little USDC stays for the fee of the return itself).
    const signer = (await import("viem")).createWalletClient({ account: wallet, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
    for (const token of [network.addresses.eurc, network.addresses.usdc]) {
      const left = await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] }).catch(() => 0n);
      const keep = token === network.addresses.usdc ? usdc("0.02") : 0n;
      if (left > keep) {
        const hash = await signer.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - keep] }).catch(() => undefined);
        if (hash) await client.waitForTransactionReceipt({ hash }).catch(() => undefined);
      }
    }
    if (userId) await deleteUser(db, userId);
    await close();
  });

  // A signed-in person with a set-up wallet holding 2.3 USDC (Circle's test ops wallet sends it).
  const signIn = await privySignIn(app, person, { platform: "ios", installationId: `front-door-${TEST_ID.slice(0, 8)}` });
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = (method: string, path: string, payload?: unknown) => app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  const { authorization } = (await (await call("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
  const signedAuth = await wallet.signAuthorization(authorization);
  await expectStatus(
    await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signedAuth.address, chainId: signedAuth.chainId, nonce: signedAuth.nonce, r: signedAuth.r, s: signedAuth.s, yParity: signedAuth.yParity } }),
    200,
    "setup",
  );
  const drip = await circle.createTransaction({
    walletAddress: env.OPS_WALLET_ADDRESS_TESTNET,
    blockchain: network.circleBlockchain,
    tokenAddress: network.addresses.usdc,
    destinationAddress: wallet.address,
    amount: ["2.3"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  });
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
    if (DONE_STATES.includes(state)) break;
    await wait(POLL_MS);
  }

  // 1. ONE live agent turn: "swap 2 USDC to EURC", read as the phone reads it (the UI message stream).
  const threadId = randomUUID();
  const turn = await call("POST", "/agent/chat", { id: threadId, message: { id: randomUUID(), role: "user", parts: [{ type: "text", text: "swap 2 USDC to EURC" }] } });
  await expectStatus(turn, 200, "agent turn");
  const raw = await turn.text();
  const chunks: Chunk[] = raw
    .split("\n\n")
    .map((frame) => frame.split("\n").find((line) => line.startsWith("data: "))?.slice("data: ".length))
    .filter((data): data is string => Boolean(data) && data !== "[DONE]")
    .map((data) => JSON.parse(data) as Chunk);
  const names = new Map<string, string>();
  for (const chunk of chunks) if (chunk.toolCallId && chunk.toolName) names.set(chunk.toolCallId, chunk.toolName);
  const outputs = chunks.filter((chunk) => chunk.type === "tool-output-available").map((chunk) => ({ ...chunk, tool: names.get(chunk.toolCallId ?? "") ?? "" }));
  const tools = [...new Set(outputs.map((output) => output.tool))];
  const raceSnapshots = outputs.filter((output) => output.tool === "race_routes");
  const finalRace = raceSnapshots.find((output) => output.preliminary !== true)?.output as RaceRoutesOutput | undefined;
  console.info("turn tools:", tools.join(", "), "| race snapshots:", raceSnapshots.length, "(preliminary:", raceSnapshots.filter((s) => s.preliminary === true).length, ")");
  if (finalRace && finalRace.status !== "routes_unavailable")
    console.info("race rows:", finalRace.race.rows.map((row) => `${row.venue}:${row.status}${row.receive ? `=${row.receive.amount}` : ""}`).join(" "), "| best:", finalRace.race.best);
  assert.ok(raceSnapshots.length > 0, `race_routes ran (tools: ${tools.join(", ")})`);
  const proposal = outputs.find((output) => output.tool === "propose_trade" || output.tool === "propose_swap");
  assert.ok(proposal, `the agent proposed the trade (tools: ${tools.join(", ")})`);
  let intent = (proposal.output as { intent: SwapIntent }).intent;
  console.info("proposal:", intent.id, intent.state, intent.draft?.provider ?? "", intent.blocking?.code ?? "not blocked");
  assert.equal(intent.blocking, null, JSON.stringify(intent.results));

  // 2. The person's yes (no budget is bound yet: the card's slide; here the local key signs the exact transaction).
  const sign = (await (await call("POST", `/swaps/${intent.id}/approve`, { version: intent.version })).json()) as SwapApproveResponse;
  assert.equal(sign.status, "sign", JSON.stringify(sign));
  if (sign.status !== "sign") return;
  const t: UnsignedTransaction = sign.transaction;
  const unsigned: TransactionSerializable = {
    type: "eip1559",
    chainId: t.chainId,
    nonce: t.nonce,
    to: t.to,
    data: t.data,
    value: BigInt(t.value),
    gas: BigInt(t.gas),
    maxFeePerGas: BigInt(t.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas),
  };
  const signed = await wallet.signTransaction(unsigned);
  await expectStatus(await call("POST", `/swaps/${intent.id}/signature`, { approvalId: sign.approvalId, signedTransaction: signed }), 200, "signature");
  for (let attempt = 0; attempt < POLL_ATTEMPTS && !FINAL.has(intent.state); attempt++) {
    await wait(POLL_MS);
    intent = ((await (await call("GET", `/swaps/${intent.id}`)).json()) as { intent: SwapIntent }).intent;
  }
  console.info("swap:", intent.state, intent.outcome, "tx", intent.tx?.hash ?? "none", "received", intent.received ?? "");
  assert.equal(intent.state, "completed", JSON.stringify({ state: intent.state, outcome: intent.outcome }));
  assert.ok(intent.tx?.hash);

  // 3. The receipt in the feed, with its venue, and its detail with the race it came from.
  let row: AgentFeed["groups"][number]["items"][number] | undefined;
  for (let attempt = 0; attempt < POLL_ATTEMPTS && !row?.txHash; attempt++) {
    const feed = (await (await call("GET", "/feed?network=testnet")).json()) as AgentFeed;
    row = feed.groups.flatMap((group) => group.items).find((item) => item.intentId === intent.id);
    if (!row?.txHash) await wait(POLL_MS);
  }
  console.info("feed row:", row?.id, row?.group, row?.outcome, "venue", row?.venue, "tx", row?.txHash);
  assert.ok(row, "the swap is in the feed");
  assert.equal(row.group, "done");
  assert.equal(row.txHash?.toLowerCase(), intent.tx.hash.toLowerCase());
  const detail = (await (await call("GET", `/feed/item/${encodeURIComponent(row.id)}?network=testnet`)).json()) as AgentFeedDetail;
  console.info("feed detail: asked", JSON.stringify(detail.asked), "| race rows", detail.race?.rows.length ?? 0);
  assert.equal(detail.item.id, row.id);
  assert.match(detail.asked ?? "", /swap 2 USDC to EURC/i);
  if (finalRace && finalRace.status !== "routes_unavailable") assert.ok(detail.race && detail.race.rows.length > 0, "the detail carries the race");

  // 4. The smart sheet's resume (no model call): a send to an unknown name, the name saved, the same send re-checked.
  const blocked = ((await (await call("POST", "/sends", { recipient: "Alex", amount: "0.05", asset: "USDC" })).json()) as { intent: SendIntent }).intent;
  console.info("send to Alex:", blocked.blocking?.code);
  assert.equal(blocked.blocking?.code, "RECIPIENT_UNKNOWN");
  await expectStatus(await call("POST", "/contacts", { displayName: "Alex", address: privateKeyToAccount(generatePrivateKey()).address, source: "pasted" }), 201, "save Alex");
  const resumed = ((await (await call("PATCH", `/sends/${blocked.id}`, {})).json()) as { intent: SendIntent }).intent;
  console.info("same send re-checked:", resumed.id === blocked.id, "v", blocked.version, "→", resumed.version, resumed.state, resumed.blocking?.code ?? "not blocked", resumed.draft?.recipient.name ?? "");
  assert.equal(resumed.id, blocked.id, "the same send, not a new one");
  assert.ok(resumed.version > blocked.version);
  assert.notEqual(resumed.blocking?.code, "RECIPIENT_UNKNOWN");
  assert.equal(resumed.draft?.recipient.name, "Alex");
  await call("POST", `/sends/${blocked.id}/cancel`);
});
