// Spike 16 server: the backend half of "Turnkey wallet in the app" on Arc testnet.
// It builds what the wallet must sign, verifies every signature itself, relays the 7702 setup, and lets the
// agent's ops wallet spend inside the signed allowance. The app screen is apps/mobile/src/spike/wallet-screen.native.tsx.
// Run: pnpm --filter @kawase/integrations-delegation spike16
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import type { Delegation } from "@metamask/smart-accounts-kit";
import { config } from "dotenv";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  http,
  parseTransaction,
  parseUnits,
  recoverTransactionAddress,
  toHex,
  verifyTypedData,
  type Address,
  type Hex,
  type SignedAuthorization,
  type TypedDataDefinition,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getNetwork } from "@kawase/networks";

import {
  buildAllowanceGrant,
  describeGrant,
  encodeRedeemTransfer,
  encodeRevoke,
  grantTypedData,
  isWalletSetUp,
  setupAuthorizationRequest,
  withSignature,
} from "../src/index.ts";

config({ path: new URL("../../../../.env", import.meta.url).pathname, quiet: true });

const PORT = 3022;
const RPC_URL = "https://rpc.testnet.arc.io";
const USDC_DECIMALS = 6;
const ALLOWANCE_PERIOD_SECONDS = 300;
const GRANT_TTL_SECONDS = 3600;
const SALT_BYTES = 32;
const MS_PER_SECOND = 1000;
const POLL_MS = 2000;
const POLL_ATTEMPTS = 90;
const TRANSFER_GAS_LIMIT = 120_000n;
const REVOKE_GAS_LIMIT = 200_000n;
const HTTP_OK = 200;
const HTTP_ERROR = 500;
const usdc = (amount: string) => parseUnits(amount, USDC_DECIMALS);
const json = (value: unknown) => JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));

const spikeStatePath = new URL("../../../../plan/spikes/code/04-delegation/.spike-state.testnet.json", import.meta.url);
const spikeState = existsSync(spikeStatePath) ? (JSON.parse(readFileSync(spikeStatePath, "utf8")) as Record<string, string>) : {};
const opsWalletId = process.env.KAWASE_TEST_OPS_WALLET_ID ?? spikeState.opsWalletId;
const opsAddress = (process.env.KAWASE_TEST_OPS_ADDRESS ?? spikeState.opsAddress) as Address | undefined;
const relayerKey = (process.env.KAWASE_TEST_RELAYER_KEY ?? spikeState.worker) as Hex | undefined;
if (!opsWalletId || !opsAddress || !relayerKey) throw new Error("Missing the ops wallet or relayer key (see the integration test header)");

const network = getNetwork("testnet");
const token = network.addresses.usdc;
const chain = network.viemChain;
const transport = http(RPC_URL);
const client = createPublicClient({ chain, transport });
const relayer = createWalletClient({ account: privateKeyToAccount(relayerKey), chain, transport });
const circle = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_TEST_API_KEY ?? "",
  entitySecret: process.env.CIRCLE_TEST_ENTITY_SECRET ?? "",
});

const pendingGrants = new Map<string, { wallet: Address; grant: Delegation; typedData: TypedDataDefinition }>();
const grants = new Map<string, Delegation>(); // wallet (lowercase) -> signed allowance
const pendingTransactions = new Map<string, { wallet: Address; to: Address; data: Hex; nonce: number }>();
const log: unknown[] = [];
const resultsPath = new URL("./results.spike16.json", import.meta.url);
const record = (entry: Record<string, unknown>) => {
  log.push({ at: new Date().toISOString(), ...entry });
  writeFileSync(resultsPath, json(log));
  console.log("RESULT", json(entry));
};

async function waitForCircle(id: string) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const transaction = (await circle.getTransaction({ id })).data?.transaction;
    if (transaction && ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"].includes(transaction.state)) return transaction;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`Timed out waiting for Circle transaction ${id}`);
}

/** An unsigned EIP-1559 transaction for the wallet to sign; the server broadcasts it after checking it. */
async function unsignedTransaction(wallet: Address, to: Address, data: Hex, gas: bigint) {
  const nonce = await client.getTransactionCount({ address: wallet });
  const fees = await client.estimateFeesPerGas();
  const id = randomUUID();
  pendingTransactions.set(id, { wallet, to, data, nonce });
  return {
    id,
    transaction: { type: "eip1559", chainId: chain.id, nonce, to, data, value: "0", gas: gas.toString(), maxFeePerGas: fees.maxFeePerGas.toString(), maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString() },
  };
}

type Body = Record<string, string>;
const routes: Record<string, (body: Body) => Promise<unknown>> = {
  "GET /status": async () => ({ network: network.id, chainId: chain.id, ops: opsAddress, relayer: relayer.account.address }),

  // 0. Testnet money for the new wallet.
  "POST /fund": async ({ wallet }) => {
    const created = await circle.createTransaction({
      walletAddress: opsAddress,
      blockchain: "ARC-TESTNET",
      tokenAddress: token,
      destinationAddress: wallet as Address,
      amount: ["1"],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      idempotencyKey: randomUUID(),
    });
    const transaction = await waitForCircle(created.data?.id ?? "");
    record({ step: "fund", wallet, tx: transaction.txHash, state: transaction.state });
    return { tx: transaction.txHash };
  },

  // 1. Setup: the wallet signs one EIP-7702 authorization; the relayer sends it.
  "POST /setup/request": async ({ wallet }) => {
    const code = await client.getCode({ address: wallet as Address });
    if (isWalletSetUp(code)) return { alreadySetUp: true };
    const nonce = await client.getTransactionCount({ address: wallet as Address });
    return { alreadySetUp: false, authorization: setupAuthorizationRequest(network, nonce) };
  },
  "POST /setup/submit": async ({ wallet, authorization }) => {
    const signed = JSON.parse(authorization as string) as SignedAuthorization;
    const hash = await relayer.sendTransaction({ authorizationList: [signed], to: wallet as Address, data: "0x" });
    const receipt = await client.waitForTransactionReceipt({ hash });
    const setUp = isWalletSetUp(await client.getCode({ address: wallet as Address }));
    record({ step: "setup", wallet, tx: hash, status: receipt.status, setUp });
    return { tx: hash, setUp };
  },

  // 2. The allowance: built here, signed by the wallet, verified here.
  "POST /allowance/request": async ({ wallet, amount }) => {
    const now = Math.floor(Date.now() / MS_PER_SECOND);
    const grant = buildAllowanceGrant({
      network,
      wallet: wallet as Address,
      redeemer: opsAddress,
      token,
      amountPerPeriod: usdc(amount ?? "0.5"),
      periodSeconds: ALLOWANCE_PERIOD_SECONDS,
      startsAt: now,
      expiresAt: now + GRANT_TTL_SECONDS,
      salt: toHex(randomBytes(SALT_BYTES)),
    });
    const typedData = grantTypedData(network, grant);
    const id = randomUUID();
    pendingGrants.set(id, { wallet: wallet as Address, grant, typedData });
    return { id, typedData: JSON.parse(json(typedData)) as unknown };
  },
  "POST /allowance/submit": async ({ id, signature }) => {
    const pending = pendingGrants.get(id ?? "");
    if (!pending) throw new Error("unknown grant id");
    const valid = await verifyTypedData({ address: pending.wallet, ...pending.typedData, signature: signature as Hex });
    if (!valid) throw new Error("the signature does not match the wallet");
    const grant = withSignature(pending.grant, signature as Hex);
    grants.set(pending.wallet.toLowerCase(), grant);
    const receipt = describeGrant(network, grant);
    record({ step: "allowance", wallet: pending.wallet, verified: valid, receipt: JSON.parse(json(receipt)) as unknown });
    return { verified: valid, receipt: JSON.parse(json(receipt)) as unknown };
  },

  // 3. The agent spends inside the allowance: no user signature.
  "POST /agent/send": async ({ wallet, to, amount }) => {
    const grant = grants.get((wallet ?? "").toLowerCase());
    if (!grant) throw new Error("no allowance for this wallet yet");
    const call = encodeRedeemTransfer(network, grant, { token, to: to as Address, amount: usdc(amount ?? "0.1") });
    let outcome: { ok: boolean; tx?: string | undefined; reason?: string | undefined };
    try {
      const created = await circle.createContractExecutionTransaction({
        walletId: opsWalletId,
        contractAddress: call.to,
        callData: call.data,
        fee: { type: "level", config: { feeLevel: "MEDIUM" } },
        idempotencyKey: randomUUID(),
      });
      const transaction = await waitForCircle(created.data?.id ?? "");
      outcome = { ok: transaction.state === "COMPLETE", tx: transaction.txHash, reason: transaction.errorReason };
    } catch (error) {
      const e = error as { code?: number; message?: string };
      outcome = { ok: false, reason: `${e.code ?? ""} ${e.message ?? ""}`.trim() };
    }
    record({ step: "agent-send", wallet, to, amount, ...outcome });
    return outcome;
  },

  // 4. Above the allowance, and the revoke: the wallet signs an exact transaction; the server checks and broadcasts it.
  "POST /wallet/send/request": async ({ wallet, to, amount }) =>
    unsignedTransaction(wallet as Address, token, encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to as Address, usdc(amount ?? "0.2")] }), TRANSFER_GAS_LIMIT),
  "POST /revoke/request": async ({ wallet }) => {
    const grant = grants.get((wallet ?? "").toLowerCase());
    if (!grant) throw new Error("no allowance for this wallet yet");
    const call = encodeRevoke(network, grant);
    return unsignedTransaction(wallet as Address, call.to, call.data, REVOKE_GAS_LIMIT);
  },
  "POST /wallet/submit": async ({ id, signedTransaction }) => {
    const pending = pendingTransactions.get(id ?? "");
    if (!pending) throw new Error("unknown transaction id");
    const parsed = parseTransaction(signedTransaction as Hex);
    const from = await recoverTransactionAddress({ serializedTransaction: signedTransaction as `0x02${string}` });
    const matches =
      from.toLowerCase() === pending.wallet.toLowerCase() &&
      parsed.to?.toLowerCase() === pending.to.toLowerCase() &&
      parsed.data === pending.data &&
      parsed.nonce === pending.nonce &&
      parsed.chainId === chain.id &&
      (parsed.value ?? 0n) === 0n;
    if (!matches) throw new Error("the signed transaction does not match what was requested");
    const hash = await client.sendRawTransaction({ serializedTransaction: signedTransaction as Hex });
    const receipt = await client.waitForTransactionReceipt({ hash });
    record({ step: "wallet-transaction", wallet: pending.wallet, tx: hash, status: receipt.status });
    return { tx: hash, status: receipt.status };
  },

  "POST /report": async (body) => {
    record({ step: "device", ...body });
    return { ok: true };
  },
};

createServer(async (request, response) => {
  const key = `${request.method} ${(request.url ?? "").split("?")[0]}`;
  let raw = "";
  for await (const chunk of request) raw += chunk;
  try {
    const handler = routes[key];
    if (!handler) throw new Error(`no route ${key}`);
    const result = await handler(raw ? (JSON.parse(raw) as Body) : {});
    response.writeHead(HTTP_OK, { "content-type": "application/json" }).end(json(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log("ERROR", key, message);
    response.writeHead(HTTP_ERROR, { "content-type": "application/json" }).end(json({ error: message }));
  }
}).listen(PORT, "::", () => console.log(`spike-16 server on :${PORT}`));
