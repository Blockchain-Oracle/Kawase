// Aero LP + Merkl rewards (earn-borrow.md "Aero LP + Merkl rewards"; surfaces.md:181): providing liquidity to Aero's
// USDC-EURC, cirBTC-USDC and WETH-USDC pools on Arc mainnet, with positions held as Aero NFTs by the person's own wallet.
//
// Deposit: one asset of the pair and an amount. The range is inferred (1% each side of the price for the stable pair,
// 10% for the others), the share the other side needs is bought with a checked KyberSwap leg, and the position minted
// to the wallet — one EIP-7702 batch (one Face ID): swap, approvals, mint, approvals back to zero. Withdraw: the whole
// position, its fees included, out to the wallet and the NFT burnt, one batch. Claim: Merkl's USDC rewards (paid on the
// fees each position earns while in range) through Merkl's Distributor with the proofs Merkl serves, one transaction.
// Every batch is built here, simulated from the wallet before it is handed out, and checked again when it comes back
// signed (WalletService). Positions are read from the chain (value, fees owed, in range or not) with Merkl's rewards.
// Practice mode never touches real money: nothing here is built while it is on.
import { erc20Abi, formatUnits, parseUnits, type Address, type Hex, type PublicClient } from "viem";

import { AERO_LP, GAS_ESTIMATE_HEADROOM_PERCENT, LEND, MS_PER_SECOND } from "@kawase/config";
import type { LpActionResponse, LpPoolView, LpPositionView, LpPositionsView, LpQuoteView, LpRewardView, LpTokenView, TransactionRequestResponse } from "@kawase/api-client";
import { encodeSelfBatch } from "@kawase/integrations-delegation";
import type { Logger } from "@kawase/log";
import type { NetworkId } from "@kawase/networks";

import { HTTP, problem } from "../http/problem";
import { kyberSwapper } from "../margin/swapper";
import type { SessionUser } from "../types";
import type { Chains, NetworkClients } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import { amountsFor, claimCall, feesOwed, mintCalls, minimum, positionManagerAbi, rangeAround, readPool, sqrtAtTick, token0Share, usedFor, withdrawCalls, type Call, type PoolState } from "./aero";

type ConfiguredPool = (typeof AERO_LP.pools)[number];
type Pool = { config: ConfiguredPool; state: PoolState; token0: LpTokenView; token1: LpTokenView };
type MerklReward = { amount: string; claimed: string; pending: string; proofs: Hex[]; token: { address: string; symbol: string; decimals: number } };

const NETWORK: NetworkId = "mainnet";
const USDC_SYMBOL = "USDC";
const PERCENT = 100n;
const RATE_PERCENT = 100;
const ZERO = 0n;
const ONE = 1n;
/** Native USDC has 18 decimals; the ERC-20 view has 6. */
const NATIVE_PER_USDC_UNIT = 1_000_000_000_000n;
const TEN = 10;
/** A share as parts per million, for bigint arithmetic. */
const PPM = 1_000_000;
const MERKL_TIMEOUT_MS = 5_000;
const MERKL_FRESH_MS = 300_000;
/** A deposit worth less than this (USD) mints dust: refused up front. */
const MIN_DEPOSIT_USD = 1;
/** Positions read per wallet (an NFT each). */
const POSITIONS_MAX = 25;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const nowSeconds = () => Math.floor(Date.now() / MS_PER_SECOND);
const withHeadroom = (gas: bigint) => (gas * GAS_ESTIMATE_HEADROOM_PERCENT) / PERCENT;

export class LpService {
  private readonly tokens = new Map<string, LpTokenView>();
  private campaigns: { at: number; byPool: Map<string, { apr: number; tvl: number | null }> } | undefined;

  constructor(
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly log: Logger,
  ) {}

  private clients(): NetworkClients {
    const clients = this.chains.get(NETWORK);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable", "Aero LP is on Arc mainnet");
    return clients;
  }

  private async token(client: PublicClient, address: Address): Promise<LpTokenView> {
    const key = address.toLowerCase();
    const known = this.tokens.get(key);
    if (known) return known;
    const [symbol, decimals] = await Promise.all([client.readContract({ address, abi: erc20Abi, functionName: "symbol" }), client.readContract({ address, abi: erc20Abi, functionName: "decimals" })]);
    const token = { address, symbol, decimals };
    this.tokens.set(key, token);
    return token;
  }

  private async pool(config: ConfiguredPool): Promise<Pool> {
    const client = this.clients().client as PublicClient;
    const state = await readPool(client, config.address as Address);
    const [token0, token1] = await Promise.all([this.token(client, state.token0), this.token(client, state.token1)]);
    return { config, state, token0, token1 };
  }

  /** A configured pool by its address or its pair ("cirBTC-USDC", "usdc/eurc"), or the first one holding `asset`. */
  private configured(pool: string | null | undefined, asset?: string | null): ConfiguredPool | undefined {
    const wanted = pool?.trim().toLowerCase().replace(/[/\s·]+/g, "-");
    if (wanted) {
      return AERO_LP.pools.find((entry) => same(entry.address, wanted) || entry.pair.toLowerCase() === wanted || entry.pair.toLowerCase().split("-").reverse().join("-") === wanted);
    }
    const symbol = asset?.trim().toLowerCase();
    return symbol ? AERO_LP.pools.find((entry) => entry.pair.toLowerCase().split("-").includes(symbol) && symbol !== USDC_SYMBOL.toLowerCase()) ?? AERO_LP.pools.find((entry) => entry.pair.toLowerCase().split("-").includes(symbol)) : undefined;
  }

  /** Merkl's live campaign on each pool: the reward rate for in-range positions and the pool's size. */
  private async campaignsByPool() {
    if (this.campaigns && Date.now() - this.campaigns.at < MERKL_FRESH_MS) return this.campaigns.byPool;
    const byPool = new Map<string, { apr: number; tvl: number | null }>();
    try {
      const response = await fetch(`${LEND.merklApi}?chainId=${this.clients().network.chainId}&status=LIVE`, { signal: AbortSignal.timeout(MERKL_TIMEOUT_MS) });
      const items = (await response.json()) as { type?: string; identifier?: string; apr?: number; tvl?: number }[];
      for (const item of items) if (item.type === "AERO" && item.identifier) byPool.set(item.identifier.toLowerCase(), { apr: (item.apr ?? 0) / RATE_PERCENT, tvl: item.tvl ?? null });
      this.campaigns = { at: Date.now(), byPool };
    } catch (error) {
      this.log.warn({ err: error }, "merkl campaigns unavailable");
    }
    return byPool;
  }

  /**
   * The pair's priced side (cirBTC, WETH, EURC) in USDC at a √price: every pool here has USDC on one side, so the other
   * is the one a person reads a price for.
   */
  private priced(pool: Pool, sqrtPrice: number) {
    const raw = sqrtPrice * sqrtPrice;
    const token0InToken1 = raw * TEN ** (pool.token0.decimals - pool.token1.decimals);
    return same(pool.token1.symbol, USDC_SYMBOL) ? { base: pool.token0, price: token0InToken1 } : { base: pool.token1, price: 1 / token0InToken1 };
  }

  /** USD per whole token for either side, from the pool's own price (USDC is the dollar). */
  private usdOf(pool: Pool, token: LpTokenView) {
    if (same(token.symbol, USDC_SYMBOL)) return 1;
    return this.priced(pool, pool.state.sqrtPrice).price;
  }

  private async poolView(pool: Pool): Promise<LpPoolView> {
    const campaign = (await this.campaignsByPool()).get(pool.config.address.toLowerCase());
    const { base, price } = this.priced(pool, pool.state.sqrtPrice);
    return {
      address: pool.config.address,
      pair: pool.config.pair,
      token0: pool.token0,
      token1: pool.token1,
      base: base.symbol,
      price,
      stable: pool.config.stable,
      rewardApr: campaign?.apr ?? null,
      tvlUsd: campaign?.tvl ?? null,
    };
  }

  private range(pool: Pool, tickLower: number, tickUpper: number) {
    const lower = this.priced(pool, sqrtAtTick(tickLower)).price;
    const upper = this.priced(pool, sqrtAtTick(tickUpper)).price;
    // A pool priced the other way round (USDC as token0) turns the range over.
    return { lower: Math.min(lower, upper), upper: Math.max(lower, upper), price: this.priced(pool, pool.state.sqrtPrice).price };
  }

  async pools(): Promise<LpPoolView[]> {
    if (!this.chains.get(NETWORK)) return [];
    return Promise.all(AERO_LP.pools.map(async (config) => this.poolView(await this.pool(config))));
  }

  // ── Deposit ─────────────────────────────────────────────────────────────────────────────────────────────────

  /** Plans a deposit: the range, the share bought of the other side (quoted, or built and checked), and the mint. */
  private async plan(user: SessionUser, input: { pool?: string | null; asset?: string | null; amount: string }, mode: "quote" | "build") {
    const clients = this.clients();
    const client = clients.client as PublicClient;
    const config = this.configured(input.pool, input.asset);
    if (!config) throw problem(HTTP.notFound, "not_found", "no Aero pool Kawase deposits into for that");
    const pool = await this.pool(config);
    const asset = [pool.token0, pool.token1].find((token) => same(token.symbol, input.asset ?? "") || same(token.address, input.asset ?? "")) ?? (same(pool.token1.symbol, USDC_SYMBOL) ? pool.token1 : pool.token0);
    const other = same(asset.address, pool.token0.address) ? pool.token1 : pool.token0;
    if (!/^\d+(\.\d+)?$/.test(input.amount.trim())) throw problem(HTTP.badRequest, "validation", "an amount is digits with a dot");
    const amount = parseUnits(input.amount.trim(), asset.decimals);
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    if (!wallet) throw problem(HTTP.unprocessable, "wallet_not_registered");
    const balance = await client.readContract({ address: asset.address as Address, abi: erc20Abi, functionName: "balanceOf", args: [wallet] });

    const { tickLower, tickUpper } = rangeAround(pool.state, config.stable ? AERO_LP.stableRangeBps : AERO_LP.volatileRangeBps);
    const share0 = token0Share(pool.state.sqrtPrice, tickLower, tickUpper);
    const assetIs0 = same(asset.address, pool.token0.address);
    // The part of the deposit that becomes the other side, bought now (its guaranteed minimum is what is minted).
    const swapIn = (amount * BigInt(Math.round((assetIs0 ? 1 - share0 : share0) * PPM))) / BigInt(PPM);
    const swapper = kyberSwapper({ chainId: clients.network.chainId, wallet, slippageBps: AERO_LP.swapSlippageBps, buildSlippageBps: AERO_LP.swapBuildSlippageBps, mode });
    const leg = swapIn > ZERO ? await swapper(asset.address as Address, other.address as Address, swapIn) : { amountOut: ZERO, minOut: ZERO, calls: [], venues: [] };
    const kept = amount - swapIn;
    const desired0 = assetIs0 ? kept : leg.minOut;
    const desired1 = assetIs0 ? leg.minOut : kept;
    const used = usedFor(Number(desired0), Number(desired1), pool.state.sqrtPrice, tickLower, tickUpper);
    const depositUsd = Number(formatUnits(amount, asset.decimals)) * this.usdOf(pool, asset);
    // Arc's gas is USDC (18 decimals natively): the fee in USDC base units, rounded up.
    const fee = ((await clients.client.estimateFeesPerGas()).maxFeePerGas * withHeadroom(AERO_LP.depositGas) + NATIVE_PER_USDC_UNIT - ONE) / NATIVE_PER_USDC_UNIT;
    const reason: LpQuoteView["reason"] = amount === ZERO || depositUsd < MIN_DEPOSIT_USD ? "below_minimum" : balance < amount ? "insufficient_balance" : null;
    const quote: LpQuoteView = {
      network: NETWORK,
      pool: await this.poolView(pool),
      asset: asset.symbol,
      amount: amount.toString(),
      range: this.range(pool, tickLower, tickUpper),
      swap: swapIn > ZERO ? { amountIn: swapIn.toString(), symbolIn: asset.symbol, symbolOut: other.symbol, minOut: leg.minOut.toString(), decimalsIn: asset.decimals, decimalsOut: other.decimals, venues: leg.venues } : null,
      deposit: { amount0: BigInt(Math.floor(used.amount0)).toString(), amount1: BigInt(Math.floor(used.amount1)).toString() },
      depositUsd,
      fees: { network: fee.toString() },
      reason,
    };
    const calls: Call[] = [
      ...leg.calls.map((call) => ({ to: call.to, data: call.data, value: call.value ?? ZERO })),
      ...mintCalls({ pool: pool.state, wallet, tickLower, tickUpper, desired0, desired1, min0: minimum(used.amount0, AERO_LP.slippageBps), min1: minimum(used.amount1, AERO_LP.slippageBps), deadline: nowSeconds() + AERO_LP.deadlineSeconds }),
    ];
    return { quote, calls, wallet };
  }

  /** What a deposit would do, quoted: nothing is built or signed. */
  async quote(user: SessionUser, input: { pool?: string | null; asset?: string | null; amount: string }): Promise<LpQuoteView> {
    return (await this.plan(user, input, "quote")).quote;
  }

  /** The deposit built now (the swap's calldata checked), simulated from the wallet, as one transaction to sign. */
  async deposit(user: SessionUser, input: { pool?: string | null; asset?: string | null; amount: string }): Promise<LpActionResponse> {
    this.refusePractice(user);
    const { quote, calls, wallet } = await this.plan(user, input, "build");
    if (quote.reason) throw problem(HTTP.unprocessable, "validation", quote.reason);
    const request = await this.batch(user, "lp_deposit", wallet, calls, AERO_LP.depositGas);
    return { quote, request };
  }

  // ── Positions, withdraw, claim ──────────────────────────────────────────────────────────────────────────────

  private async rewards(wallet: Address): Promise<MerklReward[]> {
    try {
      const response = await fetch(`${AERO_LP.merklUsersApi}/${wallet}/rewards?chainId=${this.clients().network.chainId}`, { signal: AbortSignal.timeout(MERKL_TIMEOUT_MS) });
      const chains = (await response.json()) as { chain?: { id?: number }; rewards?: MerklReward[] }[];
      return chains.find((entry) => entry.chain?.id === this.clients().network.chainId)?.rewards ?? [];
    } catch (error) {
      this.log.warn({ err: error }, "merkl rewards unavailable");
      return [];
    }
  }

  /** The wallet's Aero positions in these pools, each with what it holds now (fees included), and Merkl's rewards. */
  async positions(user: SessionUser): Promise<LpPositionsView> {
    const clients = this.chains.get(NETWORK);
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    if (!clients || !wallet) return { network: NETWORK, available: Boolean(clients), positions: [], rewards: [], claimableUsd: 0 };
    const client = clients.client as PublicClient;
    const manager = AERO_LP.positionManager as Address;
    const pools = await Promise.all(AERO_LP.pools.map((config) => this.pool(config)));
    const count = Number(await client.readContract({ address: manager, abi: positionManagerAbi, functionName: "balanceOf", args: [wallet] }));
    const ids = await Promise.all(Array.from({ length: Math.min(count, POSITIONS_MAX) }, (_, index) => client.readContract({ address: manager, abi: positionManagerAbi, functionName: "tokenOfOwnerByIndex", args: [wallet, BigInt(index)] })));
    const positions: LpPositionView[] = [];
    for (const id of ids) {
      const read = await client.readContract({ address: manager, abi: positionManagerAbi, functionName: "positions", args: [id] });
      const [, , token0, token1, tickSpacing, tickLower, tickUpper, liquidity] = read;
      const pool = pools.find((entry) => same(entry.state.token0, token0) && same(entry.state.token1, token1) && entry.state.tickSpacing === Number(tickSpacing));
      if (!pool || (liquidity === ZERO && read[10] === ZERO && read[11] === ZERO)) continue;
      const held = amountsFor(Number(liquidity), pool.state.sqrtPrice, tickLower, tickUpper);
      const fees = await feesOwed(client, wallet, id).catch(() => ({ fee0: ZERO, fee1: ZERO }));
      const whole = (raw: number, token: LpTokenView) => raw / TEN ** token.decimals;
      const valueUsd =
        (whole(held.amount0, pool.token0) + whole(Number(fees.fee0), pool.token0)) * this.usdOf(pool, pool.token0) + (whole(held.amount1, pool.token1) + whole(Number(fees.fee1), pool.token1)) * this.usdOf(pool, pool.token1);
      positions.push({
        id: id.toString(),
        pool: await this.poolView(pool),
        liquidity: liquidity.toString(),
        amount0: BigInt(Math.floor(held.amount0)).toString(),
        amount1: BigInt(Math.floor(held.amount1)).toString(),
        fees0: fees.fee0.toString(),
        fees1: fees.fee1.toString(),
        valueUsd,
        inRange: liquidity > ZERO && pool.state.tick >= tickLower && pool.state.tick < tickUpper,
        range: this.range(pool, tickLower, tickUpper),
      });
    }
    const rewards: LpRewardView[] = (await this.rewards(wallet)).map((reward) => {
      const claimable = BigInt(reward.amount) - BigInt(reward.claimed);
      const token = { address: reward.token.address, symbol: reward.token.symbol, decimals: reward.token.decimals };
      const usdEach = same(token.symbol, USDC_SYMBOL) ? 1 : 0;
      return { token, claimable: (claimable > ZERO ? claimable : ZERO).toString(), pending: reward.pending, usd: Number(formatUnits(claimable > ZERO ? claimable : ZERO, token.decimals)) * usdEach };
    });
    return { network: NETWORK, available: true, positions, rewards, claimableUsd: rewards.reduce((sum, reward) => sum + reward.usd, 0) };
  }

  /** The whole position out (fees included), the NFT burnt: one transaction, its minimums a percent under today's amounts. */
  async withdraw(user: SessionUser, positionId: string): Promise<LpActionResponse> {
    this.refusePractice(user);
    const client = this.clients().client as PublicClient;
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    if (!wallet) throw problem(HTTP.unprocessable, "wallet_not_registered");
    if (!/^\d+$/.test(positionId)) throw problem(HTTP.badRequest, "validation", "a position is its NFT id");
    const view = (await this.positions(user)).positions.find((position) => position.id === positionId);
    if (!view) throw problem(HTTP.notFound, "not_found", "no such Aero position in this wallet");
    const [, , , , , tickLower, tickUpper, liquidity] = await client.readContract({ address: AERO_LP.positionManager as Address, abi: positionManagerAbi, functionName: "positions", args: [BigInt(positionId)] });
    const pool = await this.pool(AERO_LP.pools.find((entry) => same(entry.address, view.pool.address))!);
    const held = amountsFor(Number(liquidity), pool.state.sqrtPrice, tickLower, tickUpper);
    const calls = withdrawCalls({ tokenId: BigInt(positionId), liquidity, wallet, min0: minimum(held.amount0, AERO_LP.slippageBps), min1: minimum(held.amount1, AERO_LP.slippageBps), deadline: nowSeconds() + AERO_LP.deadlineSeconds });
    return { position: view, request: await this.batch(user, "lp_withdraw", wallet, calls, AERO_LP.withdrawGas) };
  }

  /** Merkl's rewards that are claimable now, claimed to the wallet in one transaction. */
  async claim(user: SessionUser): Promise<LpActionResponse> {
    this.refusePractice(user);
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    if (!wallet) throw problem(HTTP.unprocessable, "wallet_not_registered");
    const due = (await this.rewards(wallet)).filter((reward) => BigInt(reward.amount) > BigInt(reward.claimed) && reward.proofs.length > 0);
    if (due.length === 0) throw problem(HTTP.notFound, "not_found", "no Merkl rewards to claim yet");
    const call = claimCall(
      wallet,
      due.map((reward) => ({ token: reward.token.address as Address, amount: BigInt(reward.amount), proofs: reward.proofs })),
    );
    const rewards = due.map((reward) => ({ token: { address: reward.token.address, symbol: reward.token.symbol, decimals: reward.token.decimals }, claimable: (BigInt(reward.amount) - BigInt(reward.claimed)).toString(), pending: reward.pending, usd: same(reward.token.symbol, USDC_SYMBOL) ? Number(formatUnits(BigInt(reward.amount) - BigInt(reward.claimed), reward.token.decimals)) : 0 }));
    return { rewards, request: await this.batch(user, "lp_claim", wallet, [call], AERO_LP.claimGas) };
  }

  /** The wallet signed one of these transactions: WalletService checks it is exactly the one handed out, then sends it. */
  async submit(user: SessionUser, requestId: string, signedTransaction: Hex) {
    return this.wallets.submitTransaction(user.id, requestId, signedTransaction);
  }

  private refusePractice(user: SessionUser) {
    if (user.practiceMode) throw problem(HTTP.conflict, "practice_mode", "practice mode is on: turn it off in Wallet & limits to do this for real");
  }

  /** The calls as one self-batch from the wallet: run against the chain as it is now first (a revert stops here), then sized and handed out. */
  private async batch(user: SessionUser, kind: string, wallet: Address, calls: Call[], fallbackGas: bigint): Promise<TransactionRequestResponse> {
    if (user.activeNetwork !== NETWORK) throw problem(HTTP.conflict, "network_mismatch", "Aero LP is on Arc mainnet");
    if (calls.some((call) => call.value !== ZERO)) throw problem(HTTP.badGateway, "simulation_failed", "a call asked for native value");
    const client = this.clients().client;
    const data = encodeSelfBatch(calls);
    try {
      await client.call({ account: wallet, to: wallet, data });
    } catch (error) {
      this.log.warn({ err: error, kind }, "lp batch simulation reverted");
      throw problem(HTTP.badGateway, "simulation_failed", "it would not go through right now; nothing was sent");
    }
    const estimate = await client.estimateGas({ account: wallet, to: wallet, data }).catch(() => fallbackGas);
    return (await this.wallets.selfBatchRequest(user.id, NETWORK, kind, calls, withHeadroom(estimate))) as TransactionRequestResponse;
  }
}
