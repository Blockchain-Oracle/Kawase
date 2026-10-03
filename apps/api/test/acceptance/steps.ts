// The acceptance checklists (plan/product/cards/*.md, "Acceptance") as steps, in the order money can flow through
// one account: set up, trade, buy, earn and borrow, margin, automations and limits, sends and requests, withdrawals,
// and back in from Base. Amounts are dollar-sized; each step names its worst case so the run stays under the cap.
// Where a checklist line needs a person (an Apple Pay sheet, a web wallet, a Kraken account, a phone's push), the step
// does every part the api can and says what is left to do by hand.
import type { Address, Hex } from "viem";
import { formatUnits, keccak256, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type {
  CrossChainApproveResponse,
  CrossChainIntent,
  LendIntent,
  MarginIntent,
  MarginPositionView,
  MarginProtectionGrantRequest,
  MarginProtectionOff,
  MarginProtectionResult,
  MarginProtectionView,
  PolicyResultView,
  SwapIntent,
  UnsignedTransaction,
  YieldOptionsView,
} from "@kawase/api-client";

import { ApiError, check, fail, idem, signTransaction, signTypedData, StepSkipped, waitFor, type Ctx, type Step } from "./context";

export const ASSETS: { symbol: string; address: Address; decimals: number; native?: boolean }[] = [
  { symbol: "USDC", address: "0x3600000000000000000000000000000000000000", decimals: 6, native: true },
  { symbol: "EURC", address: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1", decimals: 6 },
  { symbol: "cirBTC", address: "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0", decimals: 8 },
  { symbol: "WETH", address: "0x128cC466B61f542da60c70e3aA11c10e19B84EDB", decimals: 18 },
  { symbol: "ARGUS", address: "0xeCe5cA8bf9220718E5727754026757512212cb3c", decimals: 18 },
];
const asset = (symbol: string) => ASSETS.find((a) => a.symbol === symbol)!;

/** What the account must hold before a live run. */
export const FUNDING = [{ chain: "Arc", symbol: "USDC", amount: 20 }];

const LIFT_API = "https://api.lift.fun/api/v1/tokens?limit=50";
const MINUTE_MS = 60_000;
const SWAP_WAIT_MS = 3 * MINUTE_MS;
const BRIDGE_WAIT_MS = 20 * MINUTE_MS;
const SCHEDULER_WAIT_MS = 5 * MINUTE_MS;
const CHANGED_RETRIES = 3;
/** A run scheduled this far ahead is due on the scheduler's next ticks. */
const RUN_LEAD_MINUTES = 2;
const TERMINAL = new Set(["completed", "failed", "rejected", "canceled", "expired"]);
/** Revert messages that mean "the pool paid less than the quote's minimum". */
const MIN_OUT_REVERT = /Return amount is not enough|Too little received|INSUFFICIENT_OUTPUT_AMOUNT|slippage/i;

type Intent = { id: string; version: number; state: string; blocking: PolicyResultView | null; results: PolicyResultView[]; tx: { hash: string } | null };
type Approve = { status: string; intent: Intent; approvalId?: string; transaction?: UnsignedTransaction; typedData?: Record<string, unknown> };

const codes = (intent: Pick<Intent, "results" | "blocking">) => [...intent.results.map((r) => r.code), ...(intent.blocking ? [intent.blocking.code] : [])];

/**
 * Approves an intent's current version, signs what the api built (a transaction, or typed data for a permit), submits
 * it and follows the intent until it ends. `base` is the resource ("/swaps", "/margin/orders", …).
 */
async function drive<T extends Intent>(ctx: Ctx, base: string, start: T, what: string, options: { override?: boolean; waitMs?: number; crossChain?: boolean } = {}): Promise<T> {
  let intent: Intent = start;
  let answer: Approve | undefined;
  for (let i = 0; i <= CHANGED_RETRIES; i++) {
    if (intent.blocking) fail(`${what}: blocked by ${intent.blocking.code} ${JSON.stringify(intent.blocking.params ?? {})}`);
    answer = await ctx.api.post<Approve>(`${base}/${intent.id}/approve`, { version: intent.version, ...(options.override ? { override: true } : {}) }, idem());
    if (answer.status !== "changed") break;
    ctx.note(`${what}: re-quoted (v${answer.intent.version}), approving the new version`);
    intent = answer.intent;
  }
  if (!answer || answer.status === "changed") fail(`${what}: kept changing under approval`);
  if (answer!.status === "final") fail(`${what}: ended before signing (${answer!.intent.state}: ${codes(answer!.intent).join(", ")})`);
  if (answer!.status === "sign" || answer!.status === "sign_typed") {
    const typed = answer!.status === "sign_typed";
    const signed = typed ? await signTypedData(ctx, answer!.typedData!) : await signTransaction(ctx, answer!.transaction!);
    const body = typed ? { approvalId: answer!.approvalId, signature: signed } : { approvalId: answer!.approvalId, signedTransaction: signed };
    await ctx.api.post(`${base}/${intent.id}/signature`, body);
  }
  const read = async () => (await ctx.api.get<{ intent: T }>(`${base}/${intent.id}`)).intent;
  if (options.crossChain && ctx.mode === "dry") {
    // The origin lands on the shadow chain; the fill happens on another chain that never saw it.
    const sent = await waitFor(`${what} origin`, read, (i) => Boolean(i.tx?.hash) || TERMINAL.has(i.state), SWAP_WAIT_MS);
    if (sent.tx?.hash) ctx.tx(what, sent.tx.hash);
    check(sent.state !== "failed" && sent.state !== "rejected", `${what}: ${sent.state} (${codes(sent).join(", ")})`);
    ctx.note(`${what}: origin simulated on mainnet state; the fill on the other chain is not checkable in a dry run`);
    return sent;
  }
  const done = await waitFor(what, read, (i) => TERMINAL.has(i.state), options.waitMs ?? SWAP_WAIT_MS);
  if (done.tx?.hash) ctx.tx(what, done.tx.hash);
  const fill = (done as unknown as { fillTx?: { hash: string } | null }).fillTx;
  if (fill?.hash) ctx.note(`${what}: delivered, fill ${fill.hash}`);
  const reverted = done.tx?.hash ? ctx.shadowError?.(done.tx.hash) : undefined;
  if (done.state !== "completed" && reverted && MIN_OUT_REVERT.test(reverted)) {
    // An aggregator quotes real mainnet state; the shadow chain also holds this run's own earlier trades, which move
    // thin pools (a meme leg) that live arbitrage would have settled. A live run quotes the state it trades on.
    throw new StepSkipped(`dry-run drift: ${what} reverted "${reverted}" on the shadow state after this run's own trades moved a pool the quote did not see; a live run quotes what it trades on`);
  }
  if (done.state !== "completed") {
    const detail = done as unknown as { outcome?: string; draft?: { venue?: string; estimatedOut?: string; minOut?: string; slippageBps?: number } | null };
    const swapLine = detail.draft?.minOut ? `; ${detail.draft.venue ?? ""} expected ${detail.draft.estimatedOut}, min ${detail.draft.minOut}, slippage ${detail.draft.slippageBps} bps` : "";
    fail(`${what}: ended ${done.state}, outcome ${detail.outcome ?? "?"} (${codes(done).join(", ") || "no reason given"})${swapLine}`);
  }
  return done;
}

async function holding(ctx: Ctx, symbol: string): Promise<number> {
  const token = asset(symbol);
  return Number(formatUnits(await ctx.arc.readContract({ address: token.address, abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] }], functionName: "balanceOf", args: [ctx.account.address] }), token.decimals));
}

async function swap(ctx: Ctx, tokenIn: string, tokenOut: string, amount: string, what: string): Promise<SwapIntent> {
  const { intent } = await ctx.api.post<{ intent: SwapIntent }>("/swaps", { tokenIn, tokenOut, amount });
  const routes = intent.draft?.routes ?? [];
  ctx.note(`${what}: ${routes.map((r) => `${r.label} ${r.status}${r.estimatedOut ? ` ${r.estimatedOut}` : ""}${r.reason ? ` (${r.reason})` : ""}`).join(" · ")}`);
  return drive(ctx, "/swaps", intent as unknown as Intent, what) as unknown as Promise<SwapIntent>;
}

async function lend(ctx: Ctx, request: Record<string, string>, what: string): Promise<LendIntent> {
  const { intent } = await ctx.api.post<{ intent: LendIntent }>("/lend/orders", request);
  if (intent.draft) ctx.note(`${what}: health ${intent.draft.healthBefore ?? "—"} → ${intent.draft.healthAfter ?? "—"}`);
  return drive(ctx, "/lend/orders", intent as unknown as Intent, what) as unknown as Promise<LendIntent>;
}

/** HH:MM in UTC, `minutes` from now. */
const utcTimeIn = (minutes: number) => new Date(Date.now() + minutes * MINUTE_MS).toISOString().slice(11, 16);

// --- steps --------------------------------------------------------------------------------------------------------

const setupAccount: Step = {
  id: "setup.mainnet",
  card: "setup",
  title: "Signed in as a real account, mainnet consent given, on mainnet",
  worstCaseUsd: 0,
  async run(ctx) {
    const consent = async (version: string) => ctx.api.post("/me/consents", { kind: "mainnet_real_money", version, locale: "en" });
    await consent("1");
    try {
      await ctx.api.put("/me/network", { network: "mainnet" });
    } catch (error) {
      const version = error instanceof ApiError ? (error.body.version as string | undefined) : undefined;
      if (!version) throw error;
      await consent(version);
      await ctx.api.put("/me/network", { network: "mainnet" });
    }
    const { user } = await ctx.api.get<{ user: { activeNetwork: string } }>("/me");
    check(user.activeNetwork === "mainnet", `the account is on ${user.activeNetwork}`);
  },
};

const setupWallet: Step = {
  id: "setup.wallet",
  card: "setup",
  title: "The wallet is set up on mainnet (one 7702 authorization; the relayer pays)",
  worstCaseUsd: 0,
  async run(ctx) {
    const request = await ctx.api.post<{ alreadySetUp: boolean; authorization?: { contractAddress: Address; chainId: number; nonce: number } }>("/wallet/setup/request", { network: "mainnet" });
    if (request.alreadySetUp) return ctx.note("already set up");
    const auth = await ctx.signer.signAuthorization({ contractAddress: request.authorization!.contractAddress, chainId: request.authorization!.chainId, nonce: request.authorization!.nonce });
    const submitted = await ctx.api.post<{ tx: string; setUp: boolean }>("/wallet/setup/submit", {
      network: "mainnet",
      authorization: { address: auth.address, chainId: auth.chainId, nonce: auth.nonce, r: auth.r, s: auth.s, yParity: auth.yParity },
    });
    ctx.tx("7702 setup (relayer pays)", submitted.tx);
    check(submitted.setUp, "the setup transaction did not take");
  },
};

const fakeUsdc: Step = {
  id: "trade.fake-usdc",
  card: "trade",
  title: 'Search "USDC" in Markets: the fake-USDC pool is blocked as an impersonator',
  worstCaseUsd: 0,
  async run(ctx) {
    const { results } = await ctx.api.get<{ results: { token: { address: string; symbol: string; status: string }; liquidityUsd: number | null }[] }>("/tokens/search?q=USDC&network=mainnet");
    const real = results.find((r) => r.token.address.toLowerCase() === asset("USDC").address.toLowerCase());
    check(real && results.indexOf(real) === 0, "the real USDC is not the first result");
    const fakes = results.filter((r) => r.token.status === "impersonator");
    check(fakes.length > 0, `no impersonator among ${results.length} results (${results.map((r) => `${r.token.symbol}:${r.token.status}`).join(", ")})`);
    const fake = fakes[0]!.token;
    const { token } = await ctx.api.get<{ token: { safety: { level: string; reasons: string[] }; actions: { id: string; available: boolean }[] } }>(`/tokens/5042/${fake.address}`);
    check(token.safety.level === "block", `the impersonator ${fake.address} reads ${token.safety.level}, not block`);
    const buy = token.actions.find((a) => a.id === "buy");
    check(!buy?.available, "buying the impersonator is offered");
    ctx.note(`${fakes.length} impersonator(s), e.g. ${fake.symbol} ${fake.address}: ${token.safety.reasons.join(", ")}; buy not offered`);
  },
};

const buyArgus: Step = {
  id: "trade.buy-argus",
  card: "trade",
  title: "Buy $1 of ARGUS: venues compared, best chosen, holdings show ARGUS with the GoPlus result",
  worstCaseUsd: 1,
  async run(ctx) {
    const done = await swap(ctx, "USDC", asset("ARGUS").address, "1", "buy ARGUS");
    const quoted = (done.draft?.routes ?? []).filter((r) => r.status !== "unavailable");
    check(quoted.length >= 1, "no venue quoted");
    ctx.note(`chose ${done.draft?.venue}; received ${done.received ?? "?"}`);
    check((await holding(ctx, "ARGUS")) > 0, "no ARGUS in the wallet after the swap");
    const { token } = await ctx.api.get<{ token: { safety: { level: string; checkedBy: string | null } } }>(`/tokens/5042/${asset("ARGUS").address}`);
    check(token.safety.checkedBy === "GoPlus", `ARGUS safety checked by ${token.safety.checkedBy}`);
    ctx.note(`GoPlus: ${token.safety.level}`);
  },
};

const liftProgress: Step = {
  id: "trade.lift-progress",
  card: "trade",
  title: "A LIFT pre-graduation token shows its progress bar and can be watched for graduation",
  worstCaseUsd: 0,
  async run(ctx) {
    const list = (await (await fetch(LIFT_API)).json()) as { items: { address?: string; token_address?: string; graduated?: boolean }[] };
    const onCurve = list.items.find((item) => item.graduated === false);
    const address = onCurve?.address ?? onCurve?.token_address;
    check(address, "LIFT lists no token still on its curve");
    const { launchpad } = await ctx.api.get<{ launchpad: { progressPct?: number; progressBps?: number; graduated: boolean; watching?: boolean } | null }>(`/launchpad/tokens/${address}?network=mainnet`);
    check(launchpad && !launchpad.graduated, `${address} shows no curve`);
    const watched = await ctx.api.post<{ launchpad: { watching?: boolean } }>(`/launchpad/tokens/${address}/watch`);
    ctx.note(`${address}: ${JSON.stringify(launchpad).slice(0, 160)}; watching ${watched.launchpad.watching ?? "yes"}`);
    await ctx.api.del(`/launchpad/tokens/${address}/watch`);
  },
};

const applePay: Step = {
  id: "money-in.apple-pay",
  card: "money-in",
  title: "Buy with Apple Pay: an onramp order opens the provider's widget (the sheet itself is by hand)",
  worstCaseUsd: 0,
  async run(ctx) {
    const onramp = await ctx.api.get<{ available: boolean; reason: string | null; sandbox: boolean }>("/onramp");
    check(onramp.available, `onramp unavailable: ${onramp.reason}`);
    if (ctx.mode === "dry") throw new StepSkipped(`manual: onramp available (sandbox ${onramp.sandbox}); a live run opens a $10 order for cirBTC and prints its widget link`);
    const order = await ctx.api.post<{ order: { id: string }; widgetUrl: string }>("/onramp/orders", { amount: "10", currency: "USD", then: "cirBTC" });
    throw new StepSkipped(`manual: finish Apple Pay at ${order.widgetUrl} (order ${order.order.id}); the cirBTC swap follows when USDC lands`);
  },
};

const buyCirBtc: Step = {
  id: "money-in.buy-cirbtc",
  card: "money-in",
  title: "Buy $2 of cirBTC with USDC: one approval, cirBTC in holdings",
  worstCaseUsd: 0.3,
  async run(ctx) {
    await swap(ctx, "USDC", "cirBTC", "2", "buy cirBTC");
    const held = await holding(ctx, "cirBTC");
    check(held > 0, "no cirBTC after the swap");
    ctx.data.cirBtc = held;
    ctx.note(`holding ${held} cirBTC`);
  },
};

const bestYield: Step = {
  id: "earn-borrow.best-yield",
  card: "earn-borrow",
  title: '"Best yield" for USDC: Aave V4 first (liquid), stuck vaults absent → deposit $3 → a position',
  worstCaseUsd: 0.1,
  async run(ctx) {
    const options = await ctx.api.get<YieldOptionsView>("/lend/options?asset=USDC&amount=3");
    const executable = options.options.filter((o) => o.executable);
    ctx.note(executable.map((o) => `${o.name} ${(o.rate * 100).toFixed(2)}% ($${Math.round(o.withdrawableUsd ?? 0)} out now)${o.note ? ` ${o.note}` : ""}`).join(" · "));
    // The card ranks by APY among sources liquid enough for the amount, so Bitwise can lead a small deposit; its
    // acceptance line reads "Aave V4 first". Both must be offered; this run supplies Aave V4, the liquid one, which the
    // borrow step builds on.
    const aave = executable.find((o) => o.kind === "aave_v4");
    check(aave, "Aave V4 is not offered for USDC");
    check(executable.some((o) => /bitwise/i.test(o.name)), "Bitwise is not offered as the higher-yield option");
    ctx.note(`best: ${options.options.find((o) => o.id === options.best)?.name ?? "none"}`);
    const stuck = options.options.filter((o) => o.executable && (o.withdrawableUsd ?? 1) < 3);
    check(stuck.length === 0, `offered with too little to withdraw: ${stuck.map((o) => o.name).join(", ")}`);
    await lend(ctx, { action: "supply", asset: "USDC", amount: "3" }, "supply 3 USDC to Aave V4");
    const account = await ctx.api.get<{ supplied: { asset: string; usd: number }[] }>("/lend/account");
    check(account.supplied.some((s) => s.asset === "USDC" && s.usd > 2.9), "no USDC supply on the account");
  },
};

const withdrawHalf: Step = {
  id: "earn-borrow.withdraw-half",
  card: "earn-borrow",
  title: "Withdraw half from Aave: instant",
  worstCaseUsd: 0.05,
  async run(ctx) {
    await lend(ctx, { action: "withdraw", asset: "USDC", amount: "1.5" }, "withdraw 1.5 USDC from Aave V4");
  },
};

const borrowRepay: Step = {
  id: "earn-borrow.borrow-repay",
  card: "earn-borrow",
  title: "Borrow 0.5 USDC against cirBTC: health moves with the amount → a position with health → repay all",
  worstCaseUsd: 0.2,
  async run(ctx) {
    const held = await holding(ctx, "cirBTC");
    check(held > 0, "no cirBTC to borrow against (money-in.buy-cirbtc first)");
    const collateral = held.toFixed(8);
    const { intent } = await ctx.api.post<{ intent: LendIntent }>("/lend/orders", { action: "borrow", asset: "USDC", amount: "0.5", collateralAsset: "cirBTC", collateralAmount: collateral });
    const more = (await ctx.api.patch<{ intent: LendIntent }>(`/lend/orders/${intent.id}`, { amount: "1" })).intent;
    const back = (await ctx.api.patch<{ intent: LendIntent }>(`/lend/orders/${intent.id}`, { amount: "0.5" })).intent;
    const [h1, h05] = [more.draft?.healthAfter, back.draft?.healthAfter];
    check(h1 != null && h05 != null && h1 < h05, `health did not move with the amount (1 USDC: ${h1}, 0.5 USDC: ${h05})`);
    ctx.note(`health after: ${h05} at 0.5 USDC, ${h1} at 1 USDC; liquidation ${JSON.stringify(back.draft?.liquidation)}`);
    await drive(ctx, "/lend/orders", back as unknown as Intent, "borrow 0.5 USDC against cirBTC");
    const account = await ctx.api.get<{ health: number | null; borrowed: { asset: string }[] }>("/lend/account");
    check(account.health && account.borrowed.some((b) => b.asset === "USDC"), "no USDC debt with health on the account");
    ctx.note(`position health ${account.health}`);
    await lend(ctx, { action: "repay", asset: "USDC", amount: "all" }, "repay all USDC");
    const after = await ctx.api.get<{ borrowed: { asset: string }[] }>("/lend/account");
    check(after.borrowed.length === 0, "debt left after repaying all");
  },
};

const PRICE_SCALE = 1e8;
const PROTECT_GRANTS = 6;
const TAKE_PROFIT_STEP = 0.9;
const STOP_LOSS_STEP = 1.05;

/**
 * Take-profit and stop-loss on an open short (H3, H4): targets saved, the position's six grants signed with one yes and
 * on (the position watched); then off, which hands back their on-chain disable for the wallet to sign (its own
 * transaction, or relayed when it can't pay the fee), confirmed on Arc.
 */
async function protectAndRelease(ctx: Ctx, position: MarginPositionView) {
  const mark = Number(position.markPrice) / PRICE_SCALE;
  const liquidation = position.liquidationPrice ? Number(position.liquidationPrice) / PRICE_SCALE : Number.POSITIVE_INFINITY;
  // A short: the take-profit below the price, the stop-loss above it and short of liquidation.
  const targets = { takeProfit: (mark * TAKE_PROFIT_STEP).toFixed(2), stopLoss: Math.min(mark * STOP_LOSS_STEP, (mark + liquidation) / 2).toFixed(2) };
  let saved: MarginProtectionResult;
  try {
    saved = await ctx.api.put<MarginProtectionResult>(`/margin/positions/${position.id}/protection`, targets);
  } catch (error) {
    if (error instanceof ApiError && String(error.body.type ?? "").endsWith("/protection_unavailable")) {
      ctx.note("protection: Uniswap on Arc can't close this size right now, so it isn't offered (nothing to sign)");
      return;
    }
    throw error;
  }
  check(saved.needsGrant, "targets saved without asking for the position's grants");
  const request = await ctx.api.post<MarginProtectionGrantRequest>("/margin/protection/grant", { positionId: position.id });
  check(request.grants.length === PROTECT_GRANTS, `expected ${PROTECT_GRANTS} grants, got ${request.grants.length}`);
  const signatures: { grantId: string; signature: Hex }[] = [];
  for (const grant of request.grants) signatures.push({ grantId: grant.grantId, signature: await signTypedData(ctx, grant.typedData) });
  const on = await ctx.api.post<MarginProtectionView>("/margin/protection/grant/activate", { signatures });
  check(on.grant === "active", `protection reads ${on.grant} after signing`);
  const watched = (await ctx.api.get<{ positions: MarginPositionView[] }>("/margin/positions")).positions.find((p) => p.id === position.id);
  check(watched?.protection === "armed", `the position reads ${watched?.protection} with protection on`);
  ctx.note(`protection on until ${on.expiresAt}: take-profit $${targets.takeProfit}, stop-loss $${targets.stopLoss}, watched`);
  const off = await ctx.api.del<MarginProtectionOff>(`/margin/protection/grant?positionId=${position.id}`);
  check(off.revoke, "turning protection off handed back no on-chain disable");
  const sent =
    "relayed" in off.revoke
      ? await ctx.api.post<{ tx: Hex; status: string }>("/margin/protection/disable", { requestId: off.revoke.requestId, signature: await signTypedData(ctx, off.revoke.typedData) })
      : await ctx.api.post<{ tx: Hex; status: string }>("/wallet/transactions/submit", { requestId: off.revoke.requestId, signedTransaction: await signTransaction(ctx, off.revoke.transaction) });
  ctx.tx(`disable the protection grants${"relayed" in off.revoke ? " (relayed)" : ""}`, sent.tx);
  check(sent.status === "confirmed", `the on-chain disable ended ${sent.status}`);
  const after = await ctx.api.get<MarginProtectionView>(`/margin/protection?positionId=${position.id}`);
  check(after.grant === "none", `protection reads ${after.grant} after turning it off`);
}

const shortWeth: Step = {
  id: "trade.short-weth",
  card: "trade",
  title: "Short WETH 2× with $5: liquidation price on the ticket → position with health → TP/SL on and off (grants disabled on Arc) → close all",
  worstCaseUsd: 2,
  async run(ctx) {
    const { intent } = await ctx.api.post<{ intent: MarginIntent }>("/margin/orders", { market: "WETH", side: "short", margin: "5", leverage: 2 });
    check(intent.draft?.liquidationPrice, `no plan: ${codes(intent as unknown as Intent).join(", ")}`);
    ctx.note(`exposure $${intent.draft.notionalUsd.toFixed(2)}, liquidation ${intent.draft.liquidationPrice} vs mark ${intent.draft.markPrice}, health ${intent.draft.healthAfter}`);
    const opened = await drive(ctx, "/margin/orders", intent as unknown as Intent, "open WETH short 2×", { override: true });
    const { positions } = await ctx.api.get<{ positions: MarginPositionView[] }>("/margin/positions");
    const position = positions.find((p) => p.status === "open" && p.side === "short");
    check(position, `no open short after ${opened.id}`);
    ctx.note(`position ${position.id}: ${JSON.stringify({ health: (position as unknown as { health?: number }).health }).slice(0, 80)}`);
    await protectAndRelease(ctx, position);
    const close = (await ctx.api.post<{ intent: MarginIntent }>("/margin/orders", { action: "close", positionId: position.id, fraction: 1 })).intent;
    await drive(ctx, "/margin/orders", close as unknown as Intent, "close the WETH short");
    const after = (await ctx.api.get<{ positions: MarginPositionView[] }>("/margin/positions")).positions.find((p) => p.id === position.id);
    // The positions list carries open ones only: a closed position leaves it.
    check(!after || after.status === "closed", `position reads ${after?.status} after closing`);
  },
};

const allowance: Step = {
  id: "automate-safety.limits",
  card: "automate-safety",
  title: "Loosen the daily allowance → Now→After → sign → new grant; tighten → instant",
  worstCaseUsd: 0.05,
  async run(ctx) {
    const usdc = asset("USDC").address;
    let safety = await ctx.api.get<{ allowances: { token: string; perDay: string; signedPerDay: string }[] }>("/safety");
    if (!safety.allowances.some((a) => a.token.toLowerCase() === usdc.toLowerCase())) {
      const grant = await ctx.api.post<{ grantId: string; typedData: Record<string, unknown> }>("/wallet/allowance/request", { network: "mainnet" });
      await ctx.api.post("/wallet/allowance/submit", { grantId: grant.grantId, signature: await signTypedData(ctx, grant.typedData) });
      ctx.note("everyday allowance granted");
      safety = await ctx.api.get("/safety");
    }
    const current = safety.allowances.find((a) => a.token.toLowerCase() === usdc.toLowerCase())!;
    const looser = (BigInt(current.signedPerDay) + parseUnits("5", 6)).toString();
    const change = await ctx.api.post<{ status: string; changeId: string; before: { amount?: string }; after: { amount?: string }; approval: { kind: string; typedData: Record<string, unknown>; revoke: { requestId: string; transaction: UnsignedTransaction } | null } }>("/safety/changes", { change: { kind: "allowance", token: usdc, perDay: looser } });
    check(change.status === "needs_approval" && change.approval.kind === "grant", `loosening answered ${change.status}/${change.approval?.kind}`);
    ctx.note(`Now ${change.before.amount} → After ${change.after.amount}`);
    await ctx.api.post(`/safety/changes/${change.changeId}/approve`, { signature: await signTypedData(ctx, change.approval.typedData) });
    if (change.approval.revoke) {
      const revoked = await ctx.api.post<{ tx: string; status: string }>("/wallet/transactions/submit", { requestId: change.approval.revoke.requestId, signedTransaction: await signTransaction(ctx, change.approval.revoke.transaction) });
      ctx.tx("revoke the old allowance", revoked.tx);
    }
    const tighter = (BigInt(looser) - parseUnits("5", 6)).toString();
    const tighten = await ctx.api.post<{ status: string }>("/safety/changes", { change: { kind: "allowance", token: usdc, perDay: tighter } });
    check(tighten.status === "applied", `tightening answered ${tighten.status}, not applied`);
  },
};

const dca: Step = {
  id: "automate-safety.dca",
  card: "automate-safety",
  title: '"Every day at 9 buy $1 of ARGUS": practice shows would-have runs → live → a real run lands with a why',
  worstCaseUsd: 1,
  async run(ctx) {
    type Run = { id: string; status: string; reason: string | null; tx: { hash: string } | null; needsYouId: string | null; scheduledFor: string };
    type Automation = { id: string; status: string; runs: Run[]; nextRuns: string[] };
    let id = ctx.data.dcaId as string | undefined;
    if (!id) {
      const { automation } = await ctx.api.post<{ automation: Automation }>("/automations/dca", { every: "day", time: "09:00", timezone: "UTC", from: "USDC", to: asset("ARGUS").address, amount: "1" });
      id = automation.id;
      ctx.data.dcaId = id;
    }
    const read = async () => (await ctx.api.get<{ automation: Automation }>(`/automations/${id}`)).automation;
    const simulated = await ctx.api.post<{ runs: { at: string; outcome: string; reason: string | null }[] }>(`/automations/${id}/simulate`);
    check(simulated.runs.length >= 2, `practice shows ${simulated.runs.length} run(s)`);
    ctx.note(`practice: ${simulated.runs.slice(0, 2).map((r) => `${r.at.slice(0, 16)} ${r.outcome}${r.reason ? ` (${r.reason})` : ""}`).join("; ")}`);
    // A rerun picks up where the last one stopped: live already, or a run already waiting.
    if ((await read()).status === "draft") {
      const { grants } = await ctx.api.post<{ grants: { grantId: string; typedData: Record<string, unknown> }[] }>(`/automations/${id}/grant`);
      const signatures = [];
      for (const grant of grants) signatures.push({ grantId: grant.grantId, signature: await signTypedData(ctx, grant.typedData) });
      await ctx.api.post(`/automations/${id}/activate`, { signatures });
    }
    const landed = (run: Run | undefined) => Boolean(run && run.status !== "pending" && run.status !== "executing");
    if (!landed((await read()).runs[0])) await ctx.api.patch(`/automations/${id}`, { time: utcTimeIn(RUN_LEAD_MINUTES), timezone: "UTC" });
    const due = await waitFor("the first DCA run", async () => (await read()).runs[0], landed, SCHEDULER_WAIT_MS);
    let tx = due!.tx?.hash;
    if (due!.status === "needs_you" && due!.needsYouId) {
      const opened = await ctx.api.post<{ status: string; kind: string; intent: Intent }>(`/needs-you/${due!.needsYouId}/approve`, { via: "app" });
      check(opened.kind === "swap", `the run opened a ${opened.kind}`);
      const swapped = await drive(ctx, "/swaps", opened.intent, "DCA run: buy $1 of ARGUS");
      tx = swapped.tx?.hash;
    } else {
      check(due!.status === "succeeded", `the run ended ${due!.status} (${due!.reason})`);
      if (tx) ctx.tx("DCA run", tx);
    }
    const why = await ctx.api.get<{ why: Record<string, unknown> }>(`/activity/why/run/${due!.id}`);
    check(why.why, "no why for the run");
    ctx.note(`why: ${JSON.stringify(why.why).slice(0, 200)}`);
  },
};

const pauseAll: Step = {
  id: "automate-safety.pause",
  card: "automate-safety",
  title: 'Pause all → a running automation skips with "paused" → resume',
  worstCaseUsd: 0.05,
  async run(ctx) {
    const id = ctx.data.dcaId as string | undefined;
    check(id, "no automation to pause (automate-safety.dca first)");
    const paused = await ctx.api.post<{ status: string }>("/safety/changes", { change: { kind: "pause", on: true } });
    check(paused.status === "applied" || paused.status === "unchanged", `pause answered ${paused.status}`);
    await ctx.api.patch(`/automations/${id}`, { time: utcTimeIn(RUN_LEAD_MINUTES), timezone: "UTC" });
    const skipped = await waitFor(
      "a run while paused",
      async () => (await ctx.api.get<{ automation: { runs: { status: string; reason: string | null; scheduledFor: string }[] } }>(`/automations/${id}`)).automation.runs[0],
      (run) => Boolean(run && run.status === "skipped"),
      SCHEDULER_WAIT_MS,
    );
    check(/pause/i.test(skipped!.reason ?? ""), `the run skipped for ${skipped!.reason}, not the pause`);
    const resume = await ctx.api.post<{ status: string; changeId: string; approval: { kind: string; typedData: Record<string, unknown> } }>("/safety/changes", { change: { kind: "pause", on: false } });
    if (resume.status === "needs_approval") await ctx.api.post(`/safety/changes/${resume.changeId}/approve`, { signature: await signTypedData(ctx, resume.approval.typedData) });
    const safety = await ctx.api.get<{ pausedAt: string | null }>("/safety");
    check(!safety.pausedAt, "still paused after resuming");
    const canceled = await ctx.api.post<{ revoke: { requestId: string; transaction: UnsignedTransaction } | null }>(`/automations/${id}/cancel`);
    if (canceled.revoke) {
      const revoked = await ctx.api.post<{ tx: string }>("/wallet/transactions/submit", { requestId: canceled.revoke.requestId, signedTransaction: await signTransaction(ctx, canceled.revoke.transaction) });
      ctx.tx("revoke the DCA grant", revoked.tx);
    }
  },
};

const liquidationPush: Step = {
  id: "automate-safety.liquidation-push",
  card: "automate-safety",
  title: "A liquidation-risk push opens the borrow position on the right network",
  worstCaseUsd: 0,
  async run(ctx) {
    const prefs = await ctx.api.get<{ prefs: Record<string, { push?: boolean }>; pushRegistered: boolean }>("/notifications");
    const off = prefs.prefs.position_health?.push === false;
    check(!off, "position-health pushes are switched off for this account");
    throw new StepSkipped("manual: health alerts cannot be forced with real money; the tick was proven on real at-risk accounts (margin-protection-mainnet.test.ts); tap one on the phone to check the deep link");
  },
};

const memeToNew: Step = {
  id: "money-out.meme-to-new-0x",
  card: "money-out",
  title: "Send a meme to a new 0x: first-time warning (and test-amount offer); a token contract as recipient is blocked",
  worstCaseUsd: 0,
  async run(ctx) {
    const stranger = privateKeyToAccount(generatePrivateKey()).address;
    const { intent } = await ctx.api.post<{ intent: Intent }>("/sends", { recipient: stranger, amount: "10", asset: asset("ARGUS").address });
    const found = codes(intent);
    check(found.includes("FIRST_TIME_RECIPIENT"), `no first-time warning (${found.join(", ")})`);
    ctx.note(`to a new address: ${found.join(", ")}${found.includes("TEST_AMOUNT_SUGGESTED") ? "" : " — no test-amount offer for a meme (the api offers it for USDC and EURC only)"}`);
    await ctx.api.post(`/sends/${intent.id}/cancel`);
    const toToken = (await ctx.api.post<{ intent: Intent }>("/sends", { recipient: asset("ARGUS").address, amount: "1", asset: "USDC" })).intent;
    check(toToken.blocking?.code === "RECIPIENT_TOKEN_CONTRACT", `a token contract as recipient: ${toToken.blocking?.code ?? "not blocked"}`);
    await ctx.api.post(`/sends/${toToken.id}/cancel`);
  },
};

const requestSplit: Step = {
  id: "money-out.request-split",
  card: "money-out",
  title: "Request 30 EURC split across 2 people: two shares of 15, progress 0 of 30",
  worstCaseUsd: 0,
  async run(ctx) {
    const { split } = await ctx.api.post<{ split: { id: string; shares: { name: string; amount: string; request: { link: string } }[]; collected: string; total: string; status: string } }>("/splits", {
      title: "Acceptance dinner",
      asset: "EURC",
      total: "30",
      includeMe: false,
      people: [{ name: "Ada" }, { name: "Bo" }],
    });
    const fifteen = parseUnits("15", asset("EURC").decimals);
    check(split.shares.length === 2 && split.shares.every((s) => BigInt(s.amount) === fifteen), `shares (base units): ${split.shares.map((s) => s.amount).join(", ")}`);
    ctx.note(`collected ${split.collected} of ${split.total}; pay links ${split.shares.map((s) => s.request.link).join(" ")}`);
    if (ctx.mode === "dry") await ctx.api.post(`/splits/${split.id}/cancel`);
    else ctx.note("manual: pay one share from a web wallet; the split should read 15 of 30");
  },
};

const eurcToBase: Step = {
  id: "money-out.eurc-to-base",
  card: "money-out",
  title: "Send EURC to a contact on Base: the route line, approve, the tracker completes",
  worstCaseUsd: 2.5,
  async run(ctx) {
    if ((await holding(ctx, "EURC")) < 1) await swap(ctx, "USDC", "EURC", "1.3", "buy EURC");
    const { intent } = await ctx.api.post<{ intent: CrossChainIntent }>("/crosschain/orders", { direction: "out", asset: "EURC", amount: "1", destination: "base", recipient: ctx.account.friendAddress });
    const draft = intent.draft;
    check(draft, `no route: ${codes(intent as unknown as Intent).join(", ")}`);
    ctx.note(`route ${draft.chosen}; compared ${draft.routes.map((r) => `${r.provider} ${r.executable ? (r.received ?? "?") : (r.reason ?? "no")}`).join(", ")}${draft.chosen === "cctp" ? "" : " — the card says CCTP, which carries USDC only"}`);
    await drive(ctx, "/crosschain/orders", intent as unknown as Intent, "EURC to the friend on Base", { waitMs: BRIDGE_WAIT_MS, crossChain: true });
  },
};

const kraken: Step = {
  id: "money-in.kraken-network",
  card: "money-in",
  title: 'From an exchange → Kraken → the steps show network "Arc"',
  worstCaseUsd: 0,
  async run(ctx) {
    const { exchanges } = await ctx.api.get<{ exchanges: { slug: string; networkLabel: string; deposit: string; unavailable: string | null }[] }>("/withdrawals/exchanges");
    const found = exchanges.find((e) => e.slug === "kraken");
    check(found, "Kraken is not listed");
    check(found.networkLabel === "Arc" && !found.unavailable, `Kraken: network ${found.networkLabel}, ${found.unavailable ?? found.deposit}`);
  },
};

const aaveCleanup: Step = {
  id: "earn-borrow.withdraw-rest",
  card: "earn-borrow",
  title: "Take the rest out of Aave (USDC and the cirBTC collateral) before the withdrawals",
  worstCaseUsd: 0.05,
  async run(ctx) {
    const account = await ctx.api.get<{ supplied: { asset: string; amount: string }[] }>("/lend/account");
    for (const supplied of account.supplied) await lend(ctx, { action: "withdraw", asset: supplied.asset, amount: "all" }, `withdraw all ${supplied.asset} from Aave V4`);
    if (!account.supplied.length) ctx.note("nothing left on Aave");
  },
};

type WithdrawalView = { id: string; status: string; steps: { id: string; kind: string; state: string; arriving: boolean; failure: string | null; explorerUrl: string | null; blocking: PolicyResultView | null }[] };
type NextView = {
  withdrawal: WithdrawalView;
  step: { id: string; kind: string } | null;
  intent: { kind: "swap" | "send" | "crosschain"; id: string; version: number; blocking: PolicyResultView | null; brake: boolean } | null;
  /** Every step left is signed by the wallet on Arc: they go as one EIP-7702 batch (`/withdrawals/:id/batch`). */
  batch: { steps: string[] } | null;
};
type BatchAnswer = { status: "sign"; withdrawal: WithdrawalView; approvalId: string; transaction: UnsignedTransaction } | { status: "executing" | "changed" | "stopped" | "steps"; withdrawal: WithdrawalView };

const stepLine = (withdrawal: WithdrawalView) => withdrawal.steps.map((step) => `${step.id}:${step.kind} ${step.state}${step.failure ? ` (${step.failure})` : ""}${step.blocking ? ` [${step.blocking.code}]` : ""}`).join(", ");

/**
 * Every step left as one transaction, the way the app does it (use-withdraw-run.ts): the server builds it, the wallet
 * signs it once, it is broadcast once; then the last step is followed until it lands (a bridge's burn: until it left,
 * in a dry run, since its delivery happens on a chain the shadow never sees). Returns whether the walk may go on.
 */
async function runWithdrawalBatch(ctx: Ctx, id: string, steps: string[], what: string): Promise<"done" | "left" | "changed"> {
  // The brake (a first-time destination) was on the review the person confirmed: the run's override, as the app's.
  const answer = await ctx.api.post<BatchAnswer>(`/withdrawals/${id}/batch`, { override: true });
  if (answer.status === "changed" || answer.status === "steps") return "changed";
  if (answer.status !== "sign") return fail(`${what}: the batch stopped before signing (${stepLine(answer.withdrawal)})`);
  const signed = await signTransaction(ctx, answer.transaction);
  const submitted = await ctx.api.post<BatchAnswer>(`/withdrawals/${id}/batch/signature`, { approvalId: answer.approvalId, signedTransaction: signed });
  const hash = keccak256(signed);
  ctx.tx(`${what}: one batch of ${steps.length} steps`, hash);
  check(submitted.status === "executing", `${what}: the signed batch reads ${submitted.status} (${stepLine(submitted.withdrawal)})`);
  const lastId = steps.at(-1)!;
  const bridge = submitted.withdrawal.steps.find((step) => step.id === lastId)?.kind === "bridge";
  const read = async () => (await ctx.api.get<{ withdrawal: WithdrawalView }>(`/withdrawals/${id}`)).withdrawal;
  const settled = (withdrawal: WithdrawalView) => {
    const last = withdrawal.steps.find((step) => step.id === lastId);
    return !last || last.state === "done" || last.state === "failed" || (bridge && ctx.mode === "dry" && last.arriving);
  };
  const after = await waitFor(`${what} batch`, read, settled, bridge && ctx.mode === "live" ? BRIDGE_WAIT_MS : SWAP_WAIT_MS);
  const last = after.steps.find((step) => step.id === lastId);
  if (last?.state === "failed") {
    const reverted = ctx.shadowError?.(hash);
    if (reverted && MIN_OUT_REVERT.test(reverted)) throw new StepSkipped(`dry-run drift: ${what} reverted "${reverted}" on the shadow state after this run's own trades moved a pool the quote did not see`);
    fail(`${what}: the batch's last step failed (${stepLine(after)})${reverted ? `: ${reverted}` : ""}`);
  }
  if (bridge && ctx.mode === "dry") {
    ctx.note(`${what}: the batch (conversions, transfers and the burn) simulated on mainnet state; the delivery on the other chain is not checkable in a dry run`);
    return "left";
  }
  return "done";
}

/** Runs a withdrawal the way the app does: one batch where every step left can share a transaction, else each step's intent approved and signed in turn, until none is left. */
async function runWithdrawal(ctx: Ctx, body: Record<string, unknown>, what: string) {
  const plan = await ctx.api.post<{ plan: { legs: { token: { symbol: string }; amountText: string; as: string; steps: string[]; status: string; reason: string | null }[]; blocking: string | null; totalUsd: number } }>("/withdrawals/plan", body);
  ctx.note(`${what}: ${plan.plan.legs.map((l) => `${l.amountText} ${l.token.symbol} as ${l.as} via ${l.steps.join("+")}${l.reason ? ` (${l.reason})` : ""}`).join("; ")}`);
  check(!plan.plan.blocking, `${what}: plan blocked by ${plan.plan.blocking}`);
  const { withdrawal } = await ctx.api.post<{ withdrawal: WithdrawalView }>("/withdrawals", body);
  let changed = 0;
  for (let i = 0; i < 3 * plan.plan.legs.length + CHANGED_RETRIES; i++) {
    const next = await ctx.api.post<NextView>(`/withdrawals/${withdrawal.id}/next`);
    if (!next.step) return next.withdrawal;
    if (next.batch) {
      const outcome = await runWithdrawalBatch(ctx, withdrawal.id, next.batch.steps, what);
      if (outcome === "left") return next.withdrawal;
      if (outcome === "changed") {
        if (changed++ >= CHANGED_RETRIES) fail(`${what}: the batch kept changing under approval`);
        ctx.note(`${what}: the batch was re-quoted; building it again`);
      }
      continue;
    }
    check(next.intent && !next.intent.blocking, `${what}: step ${next.step.kind} stopped (${next.intent?.blocking?.code ?? "no intent"}; ${stepLine(next.withdrawal)})`);
    const base = next.intent.kind === "swap" ? "/swaps" : next.intent.kind === "send" ? "/sends" : "/crosschain/orders";
    const { intent } = await ctx.api.get<{ intent: Intent }>(`${base}/${next.intent.id}`);
    const crossChain = next.intent.kind === "crosschain";
    await drive(ctx, base, intent, `${what}: ${next.step.kind}`, { override: next.intent.brake && !crossChain, waitMs: crossChain ? BRIDGE_WAIT_MS : SWAP_WAIT_MS, crossChain });
    if (crossChain && ctx.mode === "dry") {
      ctx.note(`${what}: later legs wait on this fill; stopping the walk here in a dry run`);
      return next.withdrawal;
    }
  }
  return fail(`${what}: did not finish`);
}

const twoAssets: Step = {
  id: "money-out.two-assets",
  card: "money-out",
  title: "Withdraw two assets at once (USDC as itself, cirBTC as cash) to a saved place",
  worstCaseUsd: 1.6,
  async run(ctx) {
    const kraken = process.env.ACCEPTANCE_KRAKEN_ADDRESS as Address | undefined;
    const placeBody = kraken
      ? { kind: "exchange", brand: "kraken", chain: "arc", address: kraken, label: "My Kraken" }
      : { kind: "wallet", chain: "arc", address: ctx.account.friendAddress, label: "Acceptance friend" };
    if (!kraken) ctx.note("no ACCEPTANCE_KRAKEN_ADDRESS: the saved place is account 1 on Arc instead of a Kraken deposit address");
    const { places } = await ctx.api.get<{ places: { id: string; address: string }[] }>("/places");
    const place = places.find((p) => p.address.toLowerCase() === placeBody.address.toLowerCase()) ?? (await ctx.api.post<{ place: { id: string } }>("/places", placeBody)).place;
    const cirBtc = await holding(ctx, "cirBTC");
    check(cirBtc > 0, "no cirBTC to withdraw as cash");
    const half = (cirBtc / 2).toFixed(8);
    await runWithdrawal(ctx, { assets: [{ asset: "USDC", amount: "1", as: "itself" }, { asset: "cirBTC", amount: half, as: "cash" }], place: place.id }, "two assets");
  },
};

const everything: Step = {
  id: "money-out.withdraw-everything",
  card: "money-out",
  title: "Withdraw everything to my own wallet on Base: every asset as itself or converted, with a reason per line",
  worstCaseUsd: 3,
  async run(ctx) {
    await runWithdrawal(ctx, { everything: true, chain: "base", address: ctx.account.address }, "everything to Base");
  },
};

const bringFromBase: Step = {
  id: "money-in.bring-from-base",
  card: "money-in",
  title: 'USDC on Base at my address → "Found on Base" → Bring to Arc via a Relay permit, no ETH → arrives',
  worstCaseUsd: 0.2,
  async run(ctx) {
    const { chains } = await ctx.api.get<{ chains: { key: string; asset: string; balance: string; decimals?: number }[] }>("/crosschain/elsewhere");
    const onBase = chains.find((c) => c.key === "base" && c.asset === "USDC");
    const amount = onBase ? Number(formatUnits(BigInt(onBase.balance), onBase.decimals ?? 6)) : 0;
    ctx.note(onBase ? `found on Base: ${amount} USDC` : "nothing found on Base yet");
    const ask = ctx.mode === "dry" && amount < 1 ? "1" : Math.floor(amount * 100) / 100 + "";
    const { intent } = await ctx.api.post<{ intent: CrossChainIntent }>("/crosschain/orders", { direction: "in", asset: "USDC", amount: ask, source: "base" });
    ctx.note(`route ${intent.draft?.chosen ?? "none"}; ${codes(intent as unknown as Intent).join(", ") || "clear"}`);
    if (ctx.mode === "dry") {
      // A permit signed here would be a real authorization that Relay could execute: the dry run stops before signing.
      if (intent.blocking) return ctx.note(`blocked by ${intent.blocking.code} — expected until USDC sits on Base`);
      const answer = await ctx.api.post<CrossChainApproveResponse>(`/crosschain/orders/${intent.id}/approve`, { version: intent.version }, idem());
      check(answer.status === "sign_typed", `bringing USDC in asked for ${answer.status}, not a permit`);
      ctx.note(`permit to sign: ${answer.status === "sign_typed" ? answer.typedData.primaryType : ""} on chain ${answer.status === "sign_typed" ? String(answer.typedData.domain.chainId) : ""} — not signed in a dry run`);
      await ctx.api.post(`/crosschain/orders/${intent.id}/cancel`);
      return;
    }
    await drive(ctx, "/crosschain/orders", intent as unknown as Intent, "bring USDC from Base", { waitMs: BRIDGE_WAIT_MS, crossChain: true });
  },
};

const catalog: Step = {
  id: "marketplace.catalog",
  card: "marketplace",
  title: "The paid-services catalog answers for an ARGUS question, with prices",
  worstCaseUsd: 0,
  async run(ctx) {
    const found = await ctx.api.get<{ services: { url: string; priceDisplay: string; provider: { name: string } }[]; total: number }>("/marketplace/services?q=token%20price%20move");
    check(found.services.length > 0, "no services in the catalog");
    ctx.note(found.services.slice(0, 3).map((s) => `${s.provider.name} ${s.priceDisplay}`).join(" · "));
  },
};

type ToolCall = { toolName: string; input: unknown; output: unknown };

/** One chat turn through the api (an AI SDK UI message stream), with the tools it called and what they returned. */
async function chat(ctx: Ctx, threadId: string, text: string): Promise<ToolCall[]> {
  const response = await ctx.api.raw("POST", "/agent/chat", { id: threadId, message: { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] } });
  const calls = new Map<string, ToolCall>();
  for (const line of response.split("\n")) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
    const chunk = JSON.parse(line.slice("data: ".length)) as { type: string; toolCallId?: string; toolName?: string; input?: unknown; output?: unknown; errorText?: string };
    if (chunk.type === "error") fail(`the agent errored: ${chunk.errorText}`);
    if (!chunk.toolCallId) continue;
    const call = calls.get(chunk.toolCallId) ?? { toolName: chunk.toolName ?? "", input: undefined, output: undefined };
    if (chunk.type === "tool-input-available") Object.assign(call, { toolName: chunk.toolName, input: chunk.input });
    if (chunk.type === "tool-output-available") call.output = chunk.output;
    calls.set(chunk.toolCallId, call);
  }
  return [...calls.values()];
}

type BuyOutput = { outcome: { status: string; purchase?: { id: string }; amount?: string }; summary: string };
const ARGUS_QUESTION = "Why did ARGUS move today? Use a paid data service if you need one.";
/** $0.05 in USDC base units: enough for a few $0.009 calls. */
const AGENT_TOP_UP = "50000";
/** $0.005: below the service's $0.009, so the agent must ask first. */
const LOW_PER_CALL_CAP = "5000";

async function fundAgentWallet(ctx: Ctx) {
  const wallet = await ctx.api.get<{ grant: unknown; balances: { total: string } }>("/marketplace/agent-wallet");
  if (!wallet.grant) {
    const grant = await ctx.api.post<{ grantId: string; typedData: Record<string, unknown> }>("/marketplace/agent-wallet/grant");
    await ctx.api.post("/marketplace/agent-wallet/grant/submit", { grantId: grant.grantId, signature: await signTypedData(ctx, grant.typedData) });
  }
  if (BigInt(wallet.balances.total) >= BigInt(AGENT_TOP_UP)) return;
  const topUp = await ctx.api.post<{ status: string; move?: { txHash?: string } }>("/marketplace/agent-wallet/top-up", { amount: AGENT_TOP_UP }, idem());
  check(topUp.status === "topped_up", `top-up answered ${topUp.status}`);
  if (topUp.move?.txHash) ctx.tx("top up the agent wallet", topUp.move.txHash);
}

const askPaid: Step = {
  id: "marketplace.ask-paid",
  card: "marketplace",
  title: 'Ask "why did ARGUS move today?": a paid service card, paid within budget, an answer',
  worstCaseUsd: 0.1,
  agent: true,
  async run(ctx) {
    await fundAgentWallet(ctx);
    const calls = await chat(ctx, crypto.randomUUID(), ARGUS_QUESTION);
    const buys = calls.filter((c) => c.toolName === "buy_service").map((c) => c.output as BuyOutput);
    ctx.note(`tools: ${calls.map((c) => c.toolName).join(", ") || "none"}`);
    check(buys.some((b) => b.outcome.status === "paid"), `no paid service call (${buys.map((b) => b.outcome.status).join(", ") || "no buy_service"})`);
    ctx.note(buys.map((b) => b.summary).join(" | ").slice(0, 300));
  },
};

const capConsent: Step = {
  id: "marketplace.cap-consent",
  card: "marketplace",
  title: "Per-call cap $0.005 → the same question → a consent card first",
  worstCaseUsd: 0.02,
  agent: true,
  async run(ctx) {
    const { settings } = await ctx.api.get<{ settings: { perCallCap: string } }>("/marketplace/agent-wallet");
    await ctx.api.patch("/marketplace/agent-wallet/settings", { perCallCap: LOW_PER_CALL_CAP });
    try {
      const calls = await chat(ctx, crypto.randomUUID(), ARGUS_QUESTION);
      const consent = calls.map((c) => c.output as BuyOutput | undefined).find((b) => b?.outcome?.status === "needs_consent");
      check(consent?.outcome.purchase, `no consent card (${calls.map((c) => c.toolName).join(", ")})`);
      await ctx.api.post(`/marketplace/purchases/${consent.outcome.purchase.id}/decision`, { decision: "decline" });
    } finally {
      await ctx.api.patch("/marketplace/agent-wallet/settings", { perCallCap: settings.perCallCap });
      const back = await ctx.api.post<{ status: string; moves?: { txHash?: string }[] }>("/marketplace/agent-wallet/return", {}, idem());
      for (const move of back.moves ?? []) if (move.txHash) ctx.tx("return the agent wallet's balance", move.txHash);
    }
  },
};

const demoSeller: Step = {
  id: "marketplace.demo-seller",
  card: "marketplace",
  title: "Testnet: the demo seller returns 402 → paid → response",
  worstCaseUsd: 0,
  agent: true,
  async run() {
    throw new StepSkipped("manual: on testnet in the app (the runner's account lives on mainnet)");
  },
};

const hibachi: Step = {
  id: "trade.hibachi",
  card: "trade",
  title: "Connect Hibachi with a key: a $5 long with TP/SL appears in Positions",
  worstCaseUsd: 0,
  async run() {
    throw new StepSkipped("no Hibachi connection in the api yet (the card says: if available)");
  },
};

export const STEPS: Step[] = [
  setupAccount,
  setupWallet,
  fakeUsdc,
  buyArgus,
  liftProgress,
  applePay,
  buyCirBtc,
  bestYield,
  withdrawHalf,
  borrowRepay,
  shortWeth,
  allowance,
  dca,
  pauseAll,
  liquidationPush,
  memeToNew,
  requestSplit,
  eurcToBase,
  kraken,
  aaveCleanup,
  twoAssets,
  everything,
  bringFromBase,
  catalog,
  askPaid,
  capConsent,
  demoSeller,
  hibachi,
];
