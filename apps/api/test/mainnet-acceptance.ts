// The mainnet acceptance run: the acceptance checklists in plan/product/cards/* (trade, money-in, money-out,
// earn-borrow, marketplace, automate-safety), walked with dollar-sized real amounts through the api as one real
// signed-in account (the Privy app's test account, its session handed to the run; see acceptance/account.ts).
//
//   pnpm --filter @kawase/api exec tsx test/mainnet-acceptance.ts            dry run (default): nothing is sent
//   pnpm --filter @kawase/api exec tsx test/mainnet-acceptance.ts --live     the real thing, against --api
//
// Flags:
//   --live                 send for real through the deployed api (default https://api.getkawase.xyz)
//   --api <url>            the api for --live
//   --cap <usd>            hard cap on what the run may cost (default 15): a step whose worst case would take the
//                          total past it does not start
//   --from <step>          start at this step (earlier ones must be done, or are skipped when --force-from)
//   --only <a,b>           run just these steps
//   --fresh                forget this mode's progress (a dry run also resets its shadow chain and database user)
//   --list                 print the plan and exit
//   --skip-openai          do not ask OpenAI for credit (agent steps are skipped)
//   --state-dir <dir>      where the account and progress live (default ~/.kawase/acceptance)
//
// The dry run is the same walk against mainnet state with nothing sent: an in-process api (the code in this checkout,
// the database in DATABASE_URL or ACCEPTANCE_DATABASE_URL) on a shadow chain (acceptance/shadow-chain.ts) where every
// transaction the run signs is simulated on mainnet state and folded into the state later reads see; the ops wallet's
// calls go the same way. Quotes, plans, policies, grants and signatures are all real. What the dry run cannot reach
// (a bridge's fill on the other chain, a seller's settlement, an Apple Pay sheet) is reported, not faked.
//
// Idempotent and resumable: each step records what it did in <state-dir>/<mode>-state.json; a rerun skips finished
// steps and resumes at the first unfinished one. It stops at the first failure with the reason. Every transaction hash
// is printed with its mainnet explorer link.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { and, eq, sql } from "drizzle-orm";
import { createPublicClient, erc20Abi, formatUnits, getAddress, http, parseUnits, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

import { PrivyClient } from "@privy-io/node";

import { createModels } from "@kawase/agent";
import { createDb, txAttempts, users } from "@kawase/db";
import { loadApiEnv, type ApiEnv } from "@kawase/env";
import { createLogger } from "@kawase/log";
import { Discovery } from "@kawase/integrations-x402";
import { getNetwork } from "@kawase/networks";
import type { WalletSigner } from "@kawase/wallet";

import { createApp } from "../src/app";
import { privyFromEnv } from "../src/auth/service";
import { appKitBridges } from "../src/bridge/engine";
import { appKitEarn } from "../src/earn/engine";
import { circleFaucet } from "../src/faucet/circle-faucet";
import { liveMarketData } from "../src/market/sources";
import { circleAgentWallets } from "../src/marketplace/agent-wallets";
import { circleOnramp } from "../src/onramp/engine";
import { appKitSwaps } from "../src/swap/engine";
import { createChains } from "../src/wallet/chain";
import { loadAccount, localStandIn, privySigners, sessionFromEnv, type PrivySession, type RunAccount, type StandIn } from "./acceptance/account";
import { Api, ApiError, arcClient, makeCtx, StepFailed, StepSkipped, type Ctx, type Mode, type TxRecord } from "./acceptance/context";
import { ShadowChain, shadowOps, type ShadowSnapshot } from "./acceptance/shadow-chain";
import { ASSETS, FUNDING, STEPS } from "./acceptance/steps";
import { privyTokens, testPrivy } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const { values: flags } = parseArgs({
  options: {
    live: { type: "boolean", default: false },
    api: { type: "string", default: "https://api.getkawase.xyz" },
    cap: { type: "string", default: "15" },
    from: { type: "string" },
    only: { type: "string" },
    fresh: { type: "boolean", default: false },
    list: { type: "boolean", default: false },
    "skip-openai": { type: "boolean", default: false },
    "state-dir": { type: "string", default: join(homedir(), ".kawase", "acceptance") },
  },
});

const MODE: Mode = flags.live ? "live" : "dry";
const CAP_USD = Number(flags.cap);
const STATE_DIR = flags["state-dir"]!;
const UPSTREAM_ARC = process.env.ARC_RPC_URL_MAINNET ?? "https://rpc.drpc.mainnet.arc.io";
/** drpc answers eth_simulateV1 and debug_traceCall, which the shadow chain needs. */
const SHADOW_UPSTREAM = "https://rpc.drpc.mainnet.arc.io";
const BASE_RPC = "https://mainnet.base.org";
const EXPLORER = getNetwork("mainnet").viemChain.blockExplorers?.default.url ?? "https://explorer.arc.io";
const USDC_DECIMALS = 6;
const NATIVE_DECIMALS = 18;
/** Below this the ops wallet or the relayer cannot pay for the run's transactions. */
const MIN_GAS_USD = 0.5;
const OPENAI_PROBE_MODEL = "gpt-4.1-nano";
const OPENAI_MIN_OUTPUT_TOKENS = 16;
const HTTP_TOO_MANY = 429;
const CLOSE_GRACE_MS = 2_000;
const SHADOW_RELAYER_USDC = "10";

type StepRecord = { status: "done" | "skipped" | "failed"; at: string; notes: string[]; txs: TxRecord[]; reason?: string };
type RunState = { mode: Mode; steps: Record<string, StepRecord>; data: Record<string, unknown>; shadow?: ShadowSnapshot };

const statePath = join(STATE_DIR, `${MODE}-state.json`);
const accountPath = join(STATE_DIR, "account.json");

function loadState(): RunState {
  if (flags.fresh || !existsSync(statePath)) return { mode: MODE, steps: {}, data: {} };
  return JSON.parse(readFileSync(statePath, "utf8")) as RunState;
}

function saveState(state: RunState) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
}

const usd = (value: number) => `$${value.toFixed(2)}`;

function printPlan() {
  console.log(`\nKawase mainnet acceptance — ${MODE === "dry" ? "DRY RUN (simulated on mainnet state, nothing sent)" : "LIVE"}; cap ${usd(CAP_USD)}`);
  let total = 0;
  for (const step of STEPS) {
    total += step.worstCaseUsd;
    console.log(`  ${step.id.padEnd(28)} ${usd(step.worstCaseUsd).padStart(6)}  ${step.agent ? "[agent] " : ""}${step.title}`);
  }
  console.log(`  ${"worst case, every step".padEnd(28)} ${usd(total).padStart(6)}`);
  console.log(`  funding the account needs: ${FUNDING.map((f) => `${f.amount} ${f.symbol} on ${f.chain}`).join(", ")}\n`);
}

// --- preflight --------------------------------------------------------------------------------------------------

async function nativeUsd(rpc: string, address: Address) {
  const client = createPublicClient({ transport: http(rpc) });
  return Number(formatUnits(await client.getBalance({ address }), NATIVE_DECIMALS));
}

async function balancesOf(address: Address) {
  const arc = createPublicClient({ transport: http(UPSTREAM_ARC) });
  const onBase = createPublicClient({ chain: base, transport: http(BASE_RPC) });
  const arcRows = await Promise.all(
    ASSETS.map(async (asset) => ({ symbol: asset.symbol, amount: Number(formatUnits(await arc.readContract({ address: asset.address, abi: erc20Abi, functionName: "balanceOf", args: [address] }), asset.decimals)) })),
  );
  const [baseUsdc, baseEth] = await Promise.all([
    onBase.readContract({ address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", abi: erc20Abi, functionName: "balanceOf", args: [address] }),
    onBase.getBalance({ address }),
  ]);
  return { arc: arcRows, base: { usdc: Number(formatUnits(baseUsdc, USDC_DECIMALS)), eth: Number(formatUnits(baseEth, NATIVE_DECIMALS)) } };
}

/** A tiny Responses API call: credit or not. Never prints the key. */
async function openAiCredit(): Promise<{ ok: boolean; reason: string }> {
  if (flags["skip-openai"]) return { ok: false, reason: "not checked (--skip-openai)" };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, reason: "no OPENAI_API_KEY" };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: OPENAI_PROBE_MODEL, input: "ok", max_output_tokens: OPENAI_MIN_OUTPUT_TOKENS }),
  });
  if (response.ok) return { ok: true, reason: "credit available" };
  const body = (await response.json().catch(() => ({}))) as { error?: { code?: string; type?: string } };
  const code = body.error?.code ?? body.error?.type ?? String(response.status);
  return { ok: false, reason: response.status === HTTP_TOO_MANY ? `exhausted (${code})` : `refused (${code})` };
}

async function preflight(env: ApiEnv, account: RunAccount, signing: { ok: boolean; reason: string }) {
  console.log("Preflight");
  const ops = env.OPS_WALLET_ADDRESS_MAINNET as Address | undefined;
  const relayerKey = env.RELAYER_PRIVATE_KEY_MAINNET;
  const relayer = relayerKey ? privateKeyToAccount((relayerKey.startsWith("0x") ? relayerKey : `0x${relayerKey}`) as Hex).address : undefined;
  const problems: string[] = [];
  for (const [name, address] of [["ops wallet", ops], ["relayer", relayer]] as const) {
    if (!address) {
      problems.push(`${name}: not configured`);
      continue;
    }
    const balance = await nativeUsd(UPSTREAM_ARC, address);
    const short = balance < MIN_GAS_USD;
    console.log(`  ${name.padEnd(12)} ${address}  ${usd(balance)} USDC for gas${short ? `  ← needs at least ${usd(MIN_GAS_USD)}` : ""}`);
    if (short) problems.push(`${name} ${address} holds ${usd(balance)} (needs ${usd(MIN_GAS_USD)} for gas)`);
  }
  const held = await balancesOf(account.address);
  console.log(`  account      ${account.address}  ${held.arc.map((row) => `${row.amount} ${row.symbol}`).join(", ")} on Arc; ${held.base.usdc} USDC, ${held.base.eth} ETH on Base`);
  console.log(`  friend       ${account.friendAddress} (a key the runner holds, the "contact on Base")`);
  const usdc = held.arc.find((row) => row.symbol === "USDC")?.amount ?? 0;
  const needed = FUNDING.find((f) => f.chain === "Arc" && f.symbol === "USDC")?.amount ?? 0;
  if (usdc < needed) problems.push(`the account holds ${usdc} USDC on Arc (the run needs ${needed})`);
  if (!signing.ok) problems.push(`no signer: ${signing.reason}`);
  console.log(`  signing      ${signing.reason}`);
  const credit = await openAiCredit();
  console.log(`  OpenAI       ${credit.reason}${credit.ok ? "" : " — agent steps skipped"}`);
  return { problems, agentAvailable: credit.ok, held };
}

// --- the api, in-process (dry) or deployed (live) ----------------------------------------------------------------

async function dryRunApi(env: ApiEnv, state: RunState, standIn: StandIn) {
  const runAddress = standIn.address;
  const chain = new ShadowChain(SHADOW_UPSTREAM);
  const url = await chain.start();
  if (state.shadow) chain.restore(state.shadow);
  // A throwaway relayer: in a dry run nothing it signs can leave the shadow chain anyway.
  const relayerKey = generatePrivateKey();
  chain.setNative(privateKeyToAccount(relayerKey).address, parseUnits(SHADOW_RELAYER_USDC, NATIVE_DECIMALS));
  const shadowEnv: ApiEnv = { ...env, ARC_RPC_URL_MAINNET: url, RELAYER_PRIVATE_KEY_MAINNET: relayerKey };
  const databaseUrl = process.env.ACCEPTANCE_DATABASE_URL ?? env.DATABASE_URL;
  const { db, pool } = createDb(databaseUrl, { poolSize: 4 });
  if (flags.fresh) {
    // The shadow chain starts again at nonce 0, so the last dry run's attempts from this wallet (kept past the user's
    // deletion, and unique per network, sender and nonce) go too. This is the dry run's own database only.
    await db.delete(txAttempts).where(and(eq(txAttempts.network, "mainnet"), sql`lower(${txAttempts.fromAddress}) = ${runAddress.toLowerCase()}`));
    await db.delete(users).where(eq(users.identitySubject, standIn.person.did));
    console.log("  fresh: the dry run's database user and shadow chain start over");
  }
  const opsAddress = getAddress(env.OPS_WALLET_ADDRESS_MAINNET!);
  const app = createApp({
    db,
    log: createLogger({ service: "acceptance-api", level: (process.env.ACCEPTANCE_LOG_LEVEL ?? "warn") as "warn" }),
    // The stand-in's test identity: the in-process api trusts the test Privy key, never a real session.
    privy: testPrivy,
    chains: createChains(shadowEnv),
    faucet: circleFaucet(env.CIRCLE_TEST_API_KEY),
    // No model: agent steps are a live-run matter (and the dry run makes no OpenAI calls).
    models: createModels({}),
    ops: shadowOps(chain, () => opsAddress),
    agentWallets: circleAgentWallets(env),
    discovery: new Discovery({ demoSellerUrl: env.X402_DEMO_SELLER_URL }),
    swaps: appKitSwaps(shadowEnv),
    bridges: appKitBridges(shadowEnv),
    earn: appKitEarn(shadowEnv),
    onramp: circleOnramp(env),
    market: liveMarketData({}),
    webUrl: env.KAWASE_WEB_URL,
    reconcileIntervalMs: 5_000,
    automationTickMs: 10_000,
    rateLimitPerMinute: 10_000,
    signInLimitPerMinute: 1_000,
  });
  const transport = (_method: string, path: string, init: RequestInit) => Promise.resolve(app.request(path, init));
  // The app's sweepers keep using the pool until the process exits, so it is left to the exit.
  return { chain, transport, rpc: url, close: async () => void pool };
}

// --- the run ----------------------------------------------------------------------------------------------------

/** Signs in as the app does: the Privy session's tokens (the stand-in's test ones in a dry run); the wallet registers in the same step. */
async function signIn(api: Api, tokens: PrivySession) {
  const { token, user } = await api.call<{ token: string; user: { id: string } }>(
    "POST",
    "/auth/privy",
    { ...tokens, device: { platform: "ios", installationId: "kawase-acceptance-runner" } },
    { auth: false },
  );
  api.token = token;
  return user.id;
}

async function main() {
  printPlan();
  if (flags.list) return;
  const env = loadApiEnv();
  if (!env.MAINNET_ENABLED) throw new Error("MAINNET_ENABLED is off in the root .env");
  // A live run is the Privy test account (its session from the web app); a dry run is local keys and a test identity.
  const session = sessionFromEnv();
  const standIn = MODE === "dry" ? localStandIn(join(STATE_DIR, "dry-stand-in.json")) : undefined;
  let runAccount: RunAccount;
  let signers: { signer: WalletSigner; friendSigner: WalletSigner };
  let signing: { ok: boolean; reason: string };
  if (standIn) {
    runAccount = { address: standIn.address, friendAddress: standIn.friendAddress };
    signers = standIn;
    signing = { ok: true, reason: "local keys stand in for the wallet (the dry run signs nothing real)" };
    console.log(`  stand-in wallet for the dry run: ${standIn.address} (friend ${standIn.friendAddress})`);
  } else {
    const verifier = privyFromEnv();
    if (!session || !verifier || !env.PRIVY_APP_ID || !env.PRIVY_APP_SECRET)
      throw new Error("a live run signs in as the Privy test account: set ACCEPTANCE_PRIVY_ACCESS_TOKEN and ACCEPTANCE_PRIVY_IDENTITY_TOKEN (from the web app, signed in as it), with PRIVY_APP_ID and PRIVY_APP_SECRET");
    const { account, created } = await loadAccount(accountPath, session, verifier);
    console.log(created ? `Acceptance account ${account.address} (Privy ${account.did}); its friend key kept in ${accountPath}` : `Acceptance account: ${account.address} (${accountPath})`);
    runAccount = account;
    signers = privySigners(account, session, new PrivyClient({ appId: env.PRIVY_APP_ID, appSecret: env.PRIVY_APP_SECRET }));
    signing = { ok: true, reason: "the person's own Privy wallet, through Privy's server API on their session's JWT" };
  }

  const state = loadState();
  const { problems, agentAvailable } = await preflight(env, runAccount, signing);
  if (problems.length) {
    console.log(`\n  ${MODE === "live" ? "Cannot start" : "A live run could not start yet"}:\n${problems.map((p) => `   - ${p}`).join("\n")}`);
    if (MODE === "live") process.exit(1);
    console.log("  The dry run carries on with the account funded on the shadow chain.");
  }

  let close = async () => {};
  let api: Api;
  let rpc = UPSTREAM_ARC;
  let shadow: ShadowChain | undefined;
  if (MODE === "dry") {
    const dry = await dryRunApi(env, state, standIn!);
    shadow = dry.chain;
    rpc = dry.rpc;
    close = dry.close;
    api = new Api(dry.transport);
    if (!state.shadow) {
      for (const funding of FUNDING.filter((f) => f.chain === "Arc")) {
        const asset = ASSETS.find((a) => a.symbol === funding.symbol)!;
        if (asset.native) shadow.setNative(runAccount.address, parseUnits(String(funding.amount), NATIVE_DECIMALS));
        else await shadow.setToken(asset.address, runAccount.address, parseUnits(String(funding.amount), asset.decimals));
      }
      console.log(`  shadow chain funded: ${FUNDING.filter((f) => f.chain === "Arc").map((f) => `${f.amount} ${f.symbol}`).join(", ")}`);
    }
  } else {
    const baseUrl = flags.api!.replace(/\/$/, "");
    const health = (await (await fetch(`${baseUrl}/health`)).json()) as { networks?: string[] };
    if (!health.networks?.includes("mainnet")) throw new Error(`${baseUrl} does not serve mainnet`);
    api = new Api((_method, path, init) => fetch(`${baseUrl}${path}`, init));
  }

  const own = signers;
  const base = {
    mode: MODE,
    api,
    account: runAccount,
    signer: own.signer,
    friendSigner: own.friendSigner,
    arc: arcClient(rpc),
    explorer: EXPLORER,
    agentAvailable,
    ...(shadow ? { shadowError: (hash: string) => shadow.sent.find((tx) => tx.hash === hash)?.error } : {}),
    data: state.data,
  } satisfies Omit<Ctx, "note" | "tx" | "step">;

  await signIn(api, standIn ? privyTokens(standIn.person, { device: "kawase-acceptance-runner" }) : session!);
  console.log("\nSteps");

  const only = flags.only ? new Set(flags.only.split(",")) : undefined;
  const fromIndex = flags.from ? STEPS.findIndex((s) => s.id === flags.from) : 0;
  if (fromIndex < 0) throw new Error(`no step ${flags.from}`);
  let spent = Object.entries(state.steps)
    .filter(([, record]) => record.status === "done")
    .reduce((sum, [id]) => sum + (STEPS.find((s) => s.id === id)?.worstCaseUsd ?? 0), 0);
  let failed: string | undefined;

  for (const [index, step] of STEPS.entries()) {
    if (only && !only.has(step.id)) continue;
    if (!only && index < fromIndex) continue;
    const previous = state.steps[step.id];
    if (previous?.status === "done") {
      console.log(`  ✓ ${step.id} — done ${previous.at}`);
      continue;
    }
    if (spent + step.worstCaseUsd > CAP_USD) {
      failed = `${step.id}: its worst case ${usd(step.worstCaseUsd)} would take the run past the ${usd(CAP_USD)} cap (${usd(spent)} committed)`;
      break;
    }
    console.log(`  → ${step.id}: ${step.title}`);
    const record: StepRecord = { status: "done", at: new Date().toISOString(), notes: [], txs: [] };
    try {
      if (step.agent && !agentAvailable) throw new StepSkipped("agent steps skipped: the model is unavailable");
      await step.run(makeCtx(base, step, record));
      spent += step.worstCaseUsd;
      console.log(`  ✓ ${step.id}`);
    } catch (error) {
      if (error instanceof StepSkipped) {
        record.status = "skipped";
        record.reason = error.message;
        console.log(`  ○ ${step.id} — skipped: ${error.message}`);
      } else {
        record.status = "failed";
        record.reason = error instanceof StepFailed || error instanceof ApiError ? error.message : error instanceof Error ? (error.stack ?? error.message) : String(error);
        failed = `${step.id}: ${record.reason}`;
      }
    }
    state.steps[step.id] = record;
    if (shadow) state.shadow = shadow.snapshot();
    saveState(state);
    if (failed) break;
  }

  const txs = Object.values(state.steps).flatMap((record) => record.txs);
  console.log(`\nTransactions (${txs.length})`);
  for (const tx of txs) console.log(`  ${tx.step.padEnd(28)} ${tx.what}: ${tx.hash}${tx.url ? `  ${tx.url}` : "  (simulated)"}`);
  const counts = Object.values(state.steps).reduce<Record<string, number>>((acc, record) => ({ ...acc, [record.status]: (acc[record.status] ?? 0) + 1 }), {});
  console.log(`\n${JSON.stringify(counts)}; worst-case committed ${usd(spent)} of ${usd(CAP_USD)}; progress in ${statePath}`);
  if (shadow) await shadow.stop();
  await close();
  if (failed) {
    console.log(`\nSTOPPED at ${failed}`);
    process.exitCode = 1;
  }
  setTimeout(() => process.exit(process.exitCode ?? 0), CLOSE_GRACE_MS).unref();
}

if (flags.fresh && existsSync(statePath)) rmSync(statePath);
await main();
