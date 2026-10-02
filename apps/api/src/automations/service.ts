// Automations (Stage 8; MASTER-PLAN "Automations + delegated authority"): "every Tuesday send $1 to Alex", run by
// Kawase without asking again, bounded on chain by the automation's own grant.
//
// Auto-save (8b) is the second kind: "keep $20 ready, the rest earns". Its grants (three, signed with one Face ID)
// only let Kawase move USDC between the wallet and the wallet's own position in one vault. It is checked on its
// schedule and whenever money arrives (the incoming watcher pulls the next check forward): above what it keeps, the
// rest goes into savings; below it (when topping up is on), savings refill the wallet. Moves are earn intents sent by
// the ops wallet and settled by the earn witness.
//
// Drafting: who (resolved by the send rules: a contact, an @handle, or an address the person typed), how much, and
// when (every day / week on a weekday / month on a day, at a local time in the person's zone — 09:00 and their own
// zone when not said: inferred, never asked); the next three runs and the most that can ever leave per period.
// Turning on: the grant — a delegation from the person's wallet to Kawase's ops wallet that can only call
// `token.transfer(recipient, …)`, at most `amount` per period, until it ends — is built here, in code (K2), and
// signed by the wallet with Face ID. Running: the runner below claims each due occurrence once (a unique row per
// automation and time), checks the send rules again on fresh facts, and has the ops wallet redeem that grant; a
// run that cannot go is skipped with its reason and the person is told. Pausing stops runs at once; cancelling
// stops them and hands the wallet the revoke transaction for the grant.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { encodeFunctionData, erc20Abi, formatUnits, getAddress, hashTypedData, parseUnits, verifyTypedData, type Address, type Hex, type TypedDataDefinition } from "viem";

import { AUTO_SAVE_DEFAULT_KEEP, AUTO_SAVE_MIN_MOVE, GAS_FLOAT_USDC_BASE_UNITS, MS_PER_SECOND } from "@kawase/config";
import type {
  AutoSaveInput,
  AutoSaveView,
  AutomationGrantRequest,
  AutomationInput,
  AutomationRunView,
  AutomationView,
  AutomationEdit,
  AutomationEditResponse,
  DcaInput,
  PayrollInput,
  RuleInput,
  RuleView,
  SimulatedRun,
  SimulationView,
  TransactionRequestResponse,
} from "@kawase/api-client";
import {
  attentionItems,
  automationRuns,
  automations,
  grants,
  intents,
  practiceRuns,
  txAttempts,
  users,
  type AttentionRequest,
  type PracticeResult,
  type AutoSaveAction,
  type AutomationAction,
  type DcaAction,
  type PayrollAction,
  type RuleAction,
  type AutomationMove,
  type AutomationSchedule,
  type Db,
} from "@kawase/db";
import { getChainIdentity } from "@kawase/identity";
import { bridgeContract, bridgeDestinations } from "@kawase/integrations-app-kit";
import {
  BRIDGE_PURPOSES,
  SAVE_PURPOSES,
  buildAutomationGrant,
  buildBridgeGrants,
  buildSaveGrants,
  describeGrant,
  grantTypedData,
  isWalletSetUp,
  withSignature,
  type BridgeGrants,
  type SaveGrants,
  type SavePurpose,
} from "@kawase/integrations-delegation";
import { isValidTimeZone, nextRuns, schedulePeriodSeconds } from "@kawase/intents";
import type { Logger } from "@kawase/log";
import type { AssetId } from "@kawase/money";
import type { NetworkId } from "@kawase/networks";
import { evaluateAutoSave, evaluateAutomation, evaluateDca, evaluateRule, result as policyResult, type AmountFacts, type PolicyResult } from "@kawase/policy";

import { capabilityView } from "../capabilities/service";
import type { BridgeService } from "../bridge/service";
import { usdcUnits, type EarnService } from "../earn/service";
import { HTTP, problem } from "../http/problem";
import type { InboxService } from "../inbox/service";
import { planRule } from "./rules";
import type { AutomationMarket, MarketToken } from "./market";
import type { NeedsYouService } from "./needs-you";
import { recordPractice, simulateCall } from "../safety/practice";
import { safetySettingsOf } from "../safety/settings";
import { jsonSafe } from "../intents/chain";
import { parseRequestAmount, userLimits } from "../send/facts";
import type { Recipients } from "../send/recipients";
import type { SendService } from "../send/service";
import type { SessionUser } from "../types";
import type { Chains } from "../wallet/chain";
import type { WalletService } from "../wallet/service";

type AutomationRow = typeof automations.$inferSelect;
type RunRow = typeof automationRuns.$inferSelect;
type GrantRow = typeof grants.$inferSelect;
type ScheduleInput = Pick<AutomationInput, "every" | "weekday" | "monthday" | "time" | "timezone">;

const DEFAULT_TIME = "09:00";
/** "HH:MM". */
const TIME_CHARS = 5;
const NEXT_RUNS_SHOWN = 3;
const RUNS_SHOWN = 10;
/** An automation (and its grant) lasts a year unless it is ended sooner. */
const LIFETIME_DAYS = 365;
const SECONDS_PER_DAY = 86_400;
const SALT_BYTES = 32;
const ZERO = 0n;
const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const MAX_WEEKDAY = 6;
const MAX_MONTHDAY = 28;

const nowSeconds = () => Math.floor(Date.now() / MS_PER_SECOND);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
/** Auto-save's runs that found nothing to move: kept (each check is claimed once) but not shown. */
const NOTHING_TO_MOVE = "NOTHING_TO_MOVE";
/** Reasons a run stops without telling the person (they chose it, or there was nothing to do). */
const QUIET_REASONS = new Set([NOTHING_TO_MOVE, "PAUSED_ALL"]);
/** A balance rule is looked at this often (and at once when money arrives). */
const RULE_CHECK_MS = 600_000;
/** The steps of a rule that need grants, and which. */
const RULE_PURPOSES = { bridge: BRIDGE_PURPOSES, save: ["approve", "deposit"], notify: [], send: ["send"], swap: [] } as const;
/** A claimed run whose work has not created its money intent after this long is driven again. */
const RUN_LEASE_MS = 120_000;
const USDC_DECIMALS = 6;
const FINAL_INTENT_STATES: ReadonlySet<string> = new Set(["completed", "failed", "canceled", "expired", "rejected"]);
/** A payment the person never confirmed (an approved Needs-you step left on its card) ends as not done, not failed. */
const UNCONFIRMED_STATES: ReadonlySet<string> = new Set(["canceled", "expired"]);
/** Run stops that wait for the person instead of skipping (Needs you): their safety rules held the step back. */
const ATTENDED_REASONS: ReadonlySet<string> = new Set(["NOT_ON_ALLOWLIST", "NEW_RECIPIENT_COOLDOWN", "OVER_GRANT"]);
/** A price rule looks at the executable quote this often (and the 10-minute balance look stays for the rest). */
const PRICE_CHECK_MS = 120_000;
/** The 24 h reminder: weekly and monthly runs are announced a day ahead. */
const REMIND_AHEAD_MS = 86_400_000;
const REMINDED_SCHEDULES: ReadonlySet<string> = new Set(["week", "month"]);
const SIMULATED_RUNS = 3;
const UUID_HEX = 32;
const PAYROLL_MAX_LINES = 20;
const MS_PER_DAY = SECONDS_PER_DAY * MS_PER_SECOND;

/** A payroll line's own intent id, fixed by the run's id and the line: a retried run resumes each line, never repeats it. */
export function lineIntentId(runIntentId: string, line: number): string {
  const hex = createHash("sha256").update(`${runIntentId}:line:${line}`).digest("hex").slice(0, UUID_HEX);
  // Shaped as a version-4, RFC 4122 variant uuid: the version nibble is 4 and the variant nibble 8 (Postgres stores any).
  return hex.replace(/^(.{8})(.{4}).(.{3}).(.{3})(.{12})$/, "$1-$2-4$3-8$4-$5");
}

/**
 * What an Auto-save check does now: above what it keeps (never less than the gas float the wallet needs for its own
 * transactions), the rest goes into savings; below it, with topping up on, savings refill it as far as they can.
 * Moves under the minimum are not worth a transaction.
 */
export function planSave(facts: { balance: bigint; withdrawable: bigint; keep: bigint; topUp: boolean }): AutomationMove | null {
  const floor = facts.keep > GAS_FLOAT_USDC_BASE_UNITS ? facts.keep : GAS_FLOAT_USDC_BASE_UNITS;
  if (facts.balance >= floor + AUTO_SAVE_MIN_MOVE) return { direction: "in", amount: (facts.balance - floor).toString() };
  if (facts.topUp && facts.balance + AUTO_SAVE_MIN_MOVE <= facts.keep) {
    const want = facts.keep - facts.balance;
    const amount = want < facts.withdrawable ? want : facts.withdrawable;
    if (amount >= AUTO_SAVE_MIN_MOVE) return { direction: "out", amount: amount.toString() };
  }
  return null;
}

type StoredDraft = { results: PolicyResult[]; blocking: PolicyResult | null };

export class AutomationService {
  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly recipients: Recipients,
    private readonly sends: SendService,
    private readonly earn: EarnService,
    private readonly bridges: BridgeService,
    private readonly inbox: InboxService,
    private readonly log: Logger,
    /** The Needs-you queue (8c): steps an automation may not take alone wait here. */
    private readonly needsYou?: NeedsYouService,
    /** Tokens by name and executable quotes, for DCA and price rules. */
    private readonly market?: AutomationMarket,
  ) {}

  private clients(network: NetworkId) {
    const clients = this.chains.get(network);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable", `${network} is not available`);
    return clients;
  }

  // ── Drafting ────────────────────────────────────────────────────────────────────────────────────────────────

  /** The schedule as asked, completed: 09:00 and the person's own zone when not said; this weekday / day when missing. */
  private schedule(user: SessionUser, input: ScheduleInput): { schedule: AutomationSchedule; valid: boolean } {
    const timezone = input.timezone && isValidTimeZone(input.timezone) ? input.timezone : isValidTimeZone(user.timezone) ? user.timezone : "UTC";
    const time = input.time && TIME_PATTERN.test(input.time) ? input.time.padStart(TIME_CHARS, "0") : DEFAULT_TIME;
    const today = new Date();
    const schedule: AutomationSchedule = {
      every: input.every,
      time,
      timezone,
      ...(input.every === "week" ? { weekday: input.weekday ?? today.getUTCDay() } : {}),
      ...(input.every === "month" ? { monthday: input.monthday ?? Math.min(today.getUTCDate(), MAX_MONTHDAY) } : {}),
    };
    const valid =
      (input.timezone === undefined || isValidTimeZone(input.timezone)) &&
      (schedule.weekday === undefined || (schedule.weekday >= 0 && schedule.weekday <= MAX_WEEKDAY)) &&
      (schedule.monthday === undefined || (schedule.monthday >= 1 && schedule.monthday <= MAX_MONTHDAY));
    return { schedule, valid };
  }

  /** Who, how much and when, checked on fresh facts on the automation's own network (drafting and re-checking). */
  private async draftSend(user: SessionUser, network: NetworkId, input: AutomationInput) {
    const other: NetworkId = network === "testnet" ? "mainnet" : "testnet";
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    const asset: AssetId = input.asset ?? "USDC";
    const { schedule, valid } = this.schedule(user, input);
    const resolution = await this.recipients.resolve({ id: user.id, walletAddress: wallet }, network, input.recipient);
    const amount = parseRequestAmount(input.amount, asset);
    const view = await capabilityView(this.db, this.chains.available);
    const { client, network: context } = this.clients(network);
    let setUp = false;
    let balance = ZERO;
    if (wallet) {
      const token = asset === "USDC" ? context.addresses.usdc : context.addresses.eurc;
      const [code, held] = await Promise.all([
        client.getCode({ address: wallet }),
        client.readContract({ address: token, abi: ERC20_BALANCE, functionName: "balanceOf", args: [wallet] }),
      ]);
      setUp = isWalletSetUp(code);
      balance = held;
    }
    const limits = await userLimits(this.db, user.id, network);
    const evaluation = evaluateAutomation({
      network,
      capability: { here: view.automations[network].state, other: view.automations[other].state },
      signedIn: !user.isAnonymous,
      wallet: { registered: Boolean(wallet), setUp, balance },
      recipient: resolution.facts,
      amount,
      asset,
      schedule: { valid },
      limits: { perTx: limits.perTx },
    });
    const resolved = resolution.facts.status === "resolved" ? resolution.facts : undefined;
    const action: AutomationAction = {
      recipientWords: input.recipient,
      recipientAddress: resolved ? getAddress(resolved.address) : "",
      recipientName: resolved?.name ?? (resolution.view?.handle ? `@${resolution.view.handle}` : null),
      asset,
      amount: amount.status === "ok" ? amount.baseUnits.toString() : "0",
      note: input.note?.trim() || null,
    };
    return { schedule, action, report: { results: evaluation.results, blocking: evaluation.blocking ?? null } };
  }

  /**
   * A draft is a real automation row for everyone, guests included (a guest's rows move into the account they sign
   * in to), and it keeps the request as asked, so a fix — signing in, setting up, adding the contact — re-checks
   * this same draft instead of starting over (review K03).
   */
  async create(user: SessionUser, input: AutomationInput, origin: { threadId?: string | undefined } = {}): Promise<AutomationView> {
    const network = user.activeNetwork;
    const drafted = await this.draftSend(user, network, input);
    const [row] = await this.db
      .insert(automations)
      .values({
        userId: user.id,
        network,
        kind: "scheduled_send",
        status: "draft",
        threadId: origin.threadId ?? null,
        ...drafted,
        request: { ...input },
        endsAt: new Date(Date.now() + LIFETIME_DAYS * SECONDS_PER_DAY * MS_PER_SECOND),
      })
      .returning();
    return this.view(row!);
  }

  /**
   * Auto-save's draft. Inferred, never asked: what to keep (Kawase's default when not said), the vault (the one the
   * person already saves in, else the best active one), checking every day at 09:00 in their zone and whenever money
   * arrives, and topping up on. The card shows each, and what a check right now would move.
   */
  private async draftSave(user: SessionUser, network: NetworkId, input: AutoSaveInput, self?: string) {
    const other: NetworkId = network === "testnet" ? "mainnet" : "testnet";
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    const { schedule, valid } = this.schedule(user, { every: input.every ?? "day", time: input.time, timezone: input.timezone });
    const keep = input.keep?.trim() ? parseRequestAmount(input.keep, "USDC") : ({ status: "ok", baseUnits: AUTO_SAVE_DEFAULT_KEEP } as const);
    const view = await capabilityView(this.db, this.chains.available);
    const { client } = this.clients(network);
    const { vaults, positions } = await this.earn.holdingsOn(network, wallet);
    const named = input.vault ? vaults.find((entry) => same(entry.address, input.vault!)) : undefined;
    const held = [...positions].sort((a, b) => (b.assets > a.assets ? 1 : b.assets < a.assets ? -1 : 0))[0]?.vault;
    const vault = named ?? held ?? vaults.find((entry) => entry.status === "active");
    const existing = await this.db
      .select({ id: automations.id })
      .from(automations)
      .where(and(eq(automations.userId, user.id), eq(automations.network, network), eq(automations.kind, "auto_save"), inArray(automations.status, ["active", "paused"])));
    const others = existing.filter((entry) => entry.id !== self);
    const setUp = wallet ? isWalletSetUp(await client.getCode({ address: wallet })) : false;
    const evaluation = evaluateAutoSave({
      network,
      capability: { here: view.automations[network].state, other: view.automations[other].state },
      signedIn: !user.isAnonymous,
      wallet: { registered: Boolean(wallet), setUp },
      vault: vault
        ? { status: "found", active: vault.status !== "paused" && vault.status !== "deprecated", lowLiquidity: vault.status === "low_liquidity", warnings: vault.warnings }
        : { status: "missing" },
      keep,
      schedule: { valid },
      existing: others.length > 0,
    });
    const action: AutoSaveAction = {
      vault: vault ? getAddress(vault.address) : "",
      vaultName: vault?.name ?? "",
      keep: keep.status === "ok" ? keep.baseUnits.toString() : AUTO_SAVE_DEFAULT_KEEP.toString(),
      topUp: input.topUp ?? true,
    };
    return { schedule, action, report: { results: evaluation.results, blocking: evaluation.blocking ?? null } };
  }

  async createAutoSave(user: SessionUser, input: AutoSaveInput, origin: { threadId?: string | undefined } = {}): Promise<AutomationView> {
    const network = user.activeNetwork;
    const drafted = await this.draftSave(user, network, input);
    const [row] = await this.db
      .insert(automations)
      .values({
        userId: user.id,
        network,
        kind: "auto_save",
        status: "draft",
        threadId: origin.threadId ?? null,
        ...drafted,
        request: { ...input },
        endsAt: new Date(Date.now() + LIFETIME_DAYS * SECONDS_PER_DAY * MS_PER_SECOND),
      })
      .returning();
    return this.view(row!);
  }

  /**
   * The same draft, checked again on fresh facts after a fix (sign-in, wallet setup, a contact added) — on the
   * network it was asked on, never moved to the one the person is on now. Nothing is turned on by this.
   */
  async recheck(user: SessionUser, id: string): Promise<AutomationView> {
    const row = await this.own(user.id, id);
    if (row.status !== "draft" || !row.request) return this.view(row);
    const drafted =
      row.kind === "auto_save"
        ? await this.draftSave(user, row.network, row.request as AutoSaveInput, row.id)
        : row.kind === "rule"
          ? await this.draftRule(user, row.network, row.request as unknown as RuleInput)
          : row.kind === "payroll"
            ? await this.draftPayroll(user, row.network, row.request as unknown as PayrollInput)
            : row.kind === "dca"
              ? await this.draftDca(user, row.network, row.request as unknown as DcaInput)
              : await this.draftSend(user, row.network, row.request as AutomationInput);
    const [updated] = await this.db.update(automations).set(drafted).where(eq(automations.id, row.id)).returning();
    return this.view(updated!);
  }

  /**
   * A rule's draft, from the person's words (review A1): the trigger and its number, a sender if they named one (the
   * send rules resolve it), the step (the chain for a bridge — always the person's own address there; the vault for
   * saving, inferred like Auto-save), and the amount rule. Inferred, never asked: a bridge or save when the balance
   * goes above a line moves what is above that line unless they said to keep something else.
   */
  private async draftRule(user: SessionUser, network: NetworkId, input: RuleInput) {
    const other: NetworkId = network === "testnet" ? "mainnet" : "testnet";
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    const view = await capabilityView(this.db, this.chains.available);
    const { client, network: context } = this.clients(network);
    const setUp = wallet ? isWalletSetUp(await client.getCode({ address: wallet })) : false;
    const usdcAmount = (words: string | undefined) => (words?.trim() ? parseRequestAmount(words, "USDC") : null);
    const threshold = usdcAmount(input.threshold);
    const minAmount = usdcAmount(input.minAmount);
    const from = input.from?.trim() ? await this.recipients.resolve({ id: user.id, walletAddress: wallet }, network, input.from) : null;
    // Tokens for a price or a swap: as the person said them; "from" is USDC when not said.
    const wantsTokens = input.trigger === "price" || input.action === "swap";
    const tokenIn = wantsTokens && this.market ? await this.market.token(user, network, input.tokenIn?.trim() || "USDC") : undefined;
    const tokenOut = wantsTokens && this.market && input.tokenOut?.trim() ? await this.market.token(user, network, input.tokenOut) : undefined;
    const tokensOk = Boolean(tokenIn && tokenOut && tokenIn.address.toLowerCase() !== tokenOut.address.toLowerCase());

    let step: RuleAction["step"] = { type: "notify" };
    let stepFacts: Parameters<typeof evaluateRule>[0]["step"] = { type: "notify" };
    if (input.action === "bridge") {
      const destination = bridgeDestinations(context).find((entry) => entry.id === input.destination);
      step = destination
        ? { type: "bridge", destination: destination.id, destinationName: getChainIdentity(destination.chainId)?.name ?? destination.kitChain, domain: destination.domain }
        : { type: "bridge", destination: "", destinationName: "", domain: 0 };
      stepFacts = { type: "bridge", destination: Boolean(destination) };
    } else if (input.action === "save") {
      const { vaults, positions } = await this.earn.holdingsOn(network, wallet);
      const named = input.vault ? vaults.find((entry) => same(entry.address, input.vault!)) : undefined;
      const held = [...positions].sort((a, b) => (b.assets > a.assets ? 1 : b.assets < a.assets ? -1 : 0))[0]?.vault;
      const vault = named ?? held ?? vaults.find((entry) => entry.status === "active");
      step = { type: "save", vault: vault ? getAddress(vault.address) : "", vaultName: vault?.name ?? "" };
      stepFacts = { type: "save", vault: vault ? { status: "found", active: vault.status !== "paused" && vault.status !== "deprecated", warnings: vault.warnings } : { status: "missing" } };
    } else if (input.action === "send") {
      // Sending to someone else: resolved by the send rules; at most `capPerDay` a day, pinned to them on chain.
      const asset: AssetId = input.asset ?? "USDC";
      const resolution = await this.recipients.resolve({ id: user.id, walletAddress: wallet }, network, input.recipient ?? null);
      const resolved = resolution.facts.status === "resolved" ? resolution.facts : undefined;
      const settings = await safetySettingsOf(this.db, user.id, network);
      const fixed = input.amount?.trim() ? parseRequestAmount(input.amount, asset) : null;
      const cap: AmountFacts = input.capPerDay?.trim()
        ? parseRequestAmount(input.capPerDay, asset)
        : fixed?.status === "ok"
          ? fixed
          : { status: "ok", baseUnits: settings.perPayment.value };
      step = {
        type: "send",
        recipientWords: input.recipient ?? "",
        recipientAddress: resolved ? getAddress(resolved.address) : "",
        recipientName: resolved?.name ?? (resolution.view?.handle ? `@${resolution.view.handle}` : null),
        asset,
        capPerDay: cap.status === "ok" ? cap.baseUnits.toString() : "0",
      };
      stepFacts = { type: "send", recipient: resolution.facts, capPerDay: cap };
    } else if (input.action === "swap") {
      step = { type: "swap", tokenIn: tokenIn?.address ?? "", tokenOut: tokenOut?.address ?? "", symbolIn: tokenIn?.symbol ?? "", symbolOut: tokenOut?.symbol ?? "" };
      stepFacts = { type: "swap", tokens: tokensOk };
    }

    const mode =
      input.amountMode ??
      (input.trigger === "money_out" ? "roundup" : input.percent !== undefined ? "percent" : input.amount ? "fixed" : input.trigger === "balance_above" ? "excess" : undefined);
    const fixed = usdcAmount(input.amount);
    const reserve = usdcAmount(input.reserve);
    const roundTo = usdcAmount(input.roundTo ?? "1");
    const amountRule: RuleAction["amount"] | null =
      mode === "fixed" && fixed?.status === "ok"
        ? { mode: "fixed", amount: fixed.baseUnits.toString() }
        : mode === "percent" && input.percent !== undefined
          ? { mode: "percent", percent: input.percent }
          : mode === "excess"
            ? { mode: "excess", reserve: (reserve?.status === "ok" ? reserve.baseUnits : threshold?.status === "ok" ? threshold.baseUnits : ZERO).toString() }
            : mode === "roundup" && roundTo?.status === "ok"
              ? { mode: "roundup", unit: roundTo.baseUnits.toString() }
              : null;

    const priceAmount = tokenIn && input.priceAmount?.trim() ? parseDecimal(input.priceAmount, tokenIn.decimals) : ({ status: "missing" } as const);
    const priceMin = tokenOut && input.minOut?.trim() ? parseDecimal(input.minOut, tokenOut.decimals) : ({ status: "missing" } as const);
    const stepCapability =
      input.action === "bridge" ? view.bridge[network].state : input.action === "save" ? view.yield[network].state : input.action === "swap" ? view.swap[network].state : input.action === "send" ? view.send[network].state : null;
    const evaluation = evaluateRule({
      network,
      capability: { here: view.automations[network].state, other: view.automations[other].state },
      stepCapability,
      signedIn: !user.isAnonymous,
      wallet: { registered: Boolean(wallet), setUp },
      trigger: {
        type: input.trigger,
        threshold,
        from: from?.facts ?? null,
        minAmount,
        ...(input.trigger === "price" ? { price: { tokens: tokensOk, amountIn: priceAmount, minOut: priceMin } } : {}),
      },
      step: stepFacts,
      amount: mode ? { mode, value: mode === "fixed" ? fixed : mode === "excess" ? reserve : null, percent: input.percent ?? null } : null,
    });
    const resolvedFrom = from?.facts.status === "resolved" ? from.facts : undefined;
    const trigger: RuleAction["trigger"] =
      input.trigger === "money_in"
        ? { type: "money_in", minAmount: minAmount?.status === "ok" ? minAmount.baseUnits.toString() : null, from: resolvedFrom ? getAddress(resolvedFrom.address) : null, fromName: resolvedFrom?.name ?? (from?.view?.handle ? `@${from.view.handle}` : (input.from ?? null)) }
        : input.trigger === "money_out"
          ? { type: "money_out" }
          : input.trigger === "price"
            ? {
                type: "price",
                tokenIn: tokenIn?.address ?? "",
                tokenOut: tokenOut?.address ?? "",
                symbolIn: tokenIn?.symbol ?? "",
                symbolOut: tokenOut?.symbol ?? "",
                decimalsIn: tokenIn?.decimals ?? 0,
                decimalsOut: tokenOut?.decimals ?? 0,
                amountIn: priceAmount.status === "ok" ? priceAmount.baseUnits.toString() : "0",
                minOut: priceMin.status === "ok" ? priceMin.baseUnits.toString() : "0",
              }
            : { type: input.trigger, threshold: threshold?.status === "ok" ? threshold.baseUnits.toString() : "0" };
    const action: RuleAction = { trigger, amount: amountRule ?? { mode: "fixed", amount: "0" }, step, armed: true };
    const schedule: AutomationSchedule = { every: "day", time: DEFAULT_TIME, timezone: isValidTimeZone(user.timezone) ? user.timezone : "UTC" };
    return { schedule, action, report: { results: evaluation.results, blocking: evaluation.blocking ?? null } };
  }

  /**
   * Payroll's draft (R, the freelancer persona): several people on one schedule. Each line is checked by the send rules
   * like a scheduled send of its own and becomes its own grant pinned to that person, so one Face ID covers them all
   * and no line can ever pay more, or anyone else, than it says.
   */
  private async draftPayroll(user: SessionUser, network: NetworkId, input: PayrollInput) {
    const other: NetworkId = network === "testnet" ? "mainnet" : "testnet";
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    const { schedule, valid } = this.schedule(user, input);
    const view = await capabilityView(this.db, this.chains.available);
    const { client, network: context } = this.clients(network);
    let setUp = false;
    const balances: Record<AssetId, bigint> = { USDC: ZERO, EURC: ZERO };
    if (wallet) {
      const [code, usdc, eurc] = await Promise.all([
        client.getCode({ address: wallet }),
        client.readContract({ address: context.addresses.usdc, abi: ERC20_BALANCE, functionName: "balanceOf", args: [wallet] }),
        client.readContract({ address: context.addresses.eurc, abi: ERC20_BALANCE, functionName: "balanceOf", args: [wallet] }),
      ]);
      setUp = isWalletSetUp(code);
      balances.USDC = usdc;
      balances.EURC = eurc;
    }
    const limits = await userLimits(this.db, user.id, network);
    const lines: PayrollAction["lines"] = [];
    const results: PolicyResult[] = [];
    let blocking: PolicyResult | null = null;
    const totals: Record<AssetId, bigint> = { USDC: ZERO, EURC: ZERO };
    for (const [index, line] of input.lines.slice(0, PAYROLL_MAX_LINES).entries()) {
      const asset: AssetId = line.asset ?? "USDC";
      const resolution = await this.recipients.resolve({ id: user.id, walletAddress: wallet }, network, line.recipient);
      const amount = parseRequestAmount(line.amount, asset);
      // Each line on its own; the wallet's balance is checked once against the whole run below.
      const evaluation = evaluateAutomation({
        network,
        capability: { here: view.automations[network].state, other: view.automations[other].state },
        signedIn: !user.isAnonymous,
        wallet: { registered: Boolean(wallet), setUp, balance: amount.status === "ok" ? amount.baseUnits : ZERO },
        recipient: resolution.facts,
        amount,
        asset,
        schedule: { valid },
        limits: { perTx: limits.perTx },
      });
      const tag = { line: String(index + 1), who: line.recipient };
      for (const entry of evaluation.results) results.push({ ...entry, params: { ...(entry.params ?? {}), ...tag } });
      if (!blocking && evaluation.blocking) blocking = { ...evaluation.blocking, params: { ...(evaluation.blocking.params ?? {}), ...tag } };
      const resolved = resolution.facts.status === "resolved" ? resolution.facts : undefined;
      lines.push({
        recipientWords: line.recipient,
        recipientAddress: resolved ? getAddress(resolved.address) : "",
        recipientName: resolved?.name ?? (resolution.view?.handle ? `@${resolution.view.handle}` : null),
        asset,
        amount: amount.status === "ok" ? amount.baseUnits.toString() : "0",
      });
      if (amount.status === "ok") totals[asset] += amount.baseUnits;
    }
    if (lines.length === 0) {
      const missing = policyResult("RECIPIENT_MISSING");
      results.push(missing);
      blocking ??= missing;
    }
    for (const asset of ["USDC", "EURC"] as const)
      if (totals[asset] > balances[asset]) results.push(policyResult("FIRST_RUN_UNDERFUNDED", { balance: balances[asset].toString(), asset }));
    const action: PayrollAction = { lines, note: input.note?.trim() || null };
    return { schedule, action, report: { results, blocking } };
  }

  async createPayroll(user: SessionUser, input: PayrollInput, origin: { threadId?: string | undefined } = {}): Promise<AutomationView> {
    const network = user.activeNetwork;
    const drafted = await this.draftPayroll(user, network, input);
    const [row] = await this.db
      .insert(automations)
      .values({ userId: user.id, network, kind: "payroll", status: "draft", threadId: origin.threadId ?? null, ...drafted, request: { ...input }, endsAt: new Date(Date.now() + LIFETIME_DAYS * MS_PER_DAY) })
      .returning();
    return this.view(row!);
  }

  /**
   * DCA's draft ("buy $10 of ARGUS every day"): the tokens as the person said them, an amount of the token paid, a
   * schedule. It holds no grant: a swap route cannot be pinned by caveats, and every swap is the person's own yes
   * (R5) — so each run waits in Needs you with a fresh quote, one tap and Face ID away.
   */
  private async draftDca(user: SessionUser, network: NetworkId, input: DcaInput) {
    const other: NetworkId = network === "testnet" ? "mainnet" : "testnet";
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    const { schedule, valid } = this.schedule(user, input);
    const view = await capabilityView(this.db, this.chains.available);
    const { client } = this.clients(network);
    const tokenIn = this.market ? await this.market.token(user, network, input.from) : undefined;
    const tokenOut = this.market ? await this.market.token(user, network, input.to) : undefined;
    const amount = tokenIn ? parseDecimal(input.amount, tokenIn.decimals) : parseRequestAmount(input.amount, "USDC");
    const balance = wallet && tokenIn ? await client.readContract({ address: tokenIn.address, abi: ERC20_BALANCE, functionName: "balanceOf", args: [wallet] }).catch(() => ZERO) : ZERO;
    const evaluation = evaluateDca({
      network,
      capability: { here: view.automations[network].state, other: view.automations[other].state },
      swap: view.swap[network].state,
      signedIn: !user.isAnonymous,
      wallet: { registered: Boolean(wallet), balance },
      tokens: { from: Boolean(tokenIn), to: Boolean(tokenOut), same: Boolean(tokenIn && tokenOut && same(tokenIn.address, tokenOut.address)) },
      amount,
      schedule: { valid },
    });
    const action: DcaAction = {
      tokenIn: tokenIn?.address ?? "",
      tokenOut: tokenOut?.address ?? "",
      symbolIn: tokenIn?.symbol ?? input.from,
      symbolOut: tokenOut?.symbol ?? input.to,
      decimalsIn: tokenIn?.decimals ?? USDC_DECIMALS,
      decimalsOut: tokenOut?.decimals ?? USDC_DECIMALS,
      amount: amount.status === "ok" ? amount.baseUnits.toString() : "0",
    };
    return { schedule, action, report: { results: evaluation.results, blocking: evaluation.blocking ?? null } };
  }

  async createDca(user: SessionUser, input: DcaInput, origin: { threadId?: string | undefined } = {}): Promise<AutomationView> {
    const network = user.activeNetwork;
    const drafted = await this.draftDca(user, network, input);
    const [row] = await this.db
      .insert(automations)
      .values({ userId: user.id, network, kind: "dca", status: "draft", threadId: origin.threadId ?? null, ...drafted, request: { ...input }, endsAt: new Date(Date.now() + LIFETIME_DAYS * MS_PER_DAY) })
      .returning();
    return this.view(row!);
  }

  async createRule(user: SessionUser, input: RuleInput, origin: { threadId?: string | undefined } = {}): Promise<AutomationView> {
    const network = user.activeNetwork;
    const drafted = await this.draftRule(user, network, input);
    const [row] = await this.db
      .insert(automations)
      .values({
        userId: user.id,
        network,
        kind: "rule",
        status: "draft",
        threadId: origin.threadId ?? null,
        ...drafted,
        request: { ...input },
        endsAt: new Date(Date.now() + LIFETIME_DAYS * SECONDS_PER_DAY * MS_PER_SECOND),
      })
      .returning();
    return this.view(row!);
  }

  /** What a rule's step does to the wallet's USDC right now, for its view. */
  private async ruleView(row: AutomationRow): Promise<RuleView> {
    const action = row.action as RuleAction;
    const wallet = (await this.wallets.userWallet(row.userId))?.address as Address | undefined;
    const { client, network: context } = this.clients(row.network);
    const balance = wallet ? await client.readContract({ address: context.addresses.usdc, abi: ERC20_BALANCE, functionName: "balanceOf", args: [wallet] }).catch(() => ZERO) : ZERO;
    const live = row.status === "draft" || row.status === "active";
    // A price rule's "now" is the quote now; money in and money out wait for their event.
    const quoteOut = live && action.trigger.type === "price" && wallet ? (await this.priceNow(row.network, wallet, action.trigger))?.estimatedOut : undefined;
    const plan = live && action.trigger.type !== "money_in" && action.trigger.type !== "money_out" ? planRule(action, { balance, quoteOut }) : undefined;
    const destination = action.step.type === "bridge" ? bridgeDestinations(context).find((entry) => entry.id === (action.step as { destination: string }).destination) : undefined;
    let stepView: RuleView["step"] = { type: "notify" };
    if (action.step.type === "bridge") stepView = { type: "bridge", destination: action.step.destination, destinationName: action.step.destinationName, chainId: destination?.chainId ?? 0 };
    if (action.step.type === "save") {
      const { vaults } = await this.earn.holdingsOn(row.network, undefined);
      const vault = vaults.find((entry) => same(entry.address, (action.step as { vault: string }).vault));
      stepView = { type: "save", vault: action.step.vault, vaultName: vault?.name ?? action.step.vaultName, protocol: vault?.protocol ?? "morpho", apy: vault?.apy ?? 0 };
    }
    if (action.step.type === "send" || action.step.type === "swap") stepView = action.step;
    return {
      trigger: action.trigger,
      amount: action.amount,
      step: stepView,
      armed: action.armed,
      balance: balance.toString(),
      now: plan?.kind === "fire" ? { amount: plan.amount?.toString() ?? null } : null,
    };
  }

  /**
   * The wallet's USDC, what it holds in the vault, what can come back now, and what a check would move. What can come
   * back is the position capped by the liquidity App Kit reports: the vault's own `maxWithdraw` is not reliable on
   * testnet's mock vaults (it reads 0 while withdrawals work), and the earn draft's floors still guard each move.
   */
  private async saveFacts(network: NetworkId, wallet: Address, action: AutoSaveAction) {
    const { client, network: context } = this.clients(network);
    const [balance, { vaults, positions }] = await Promise.all([
      client.readContract({ address: context.addresses.usdc, abi: ERC20_BALANCE, functionName: "balanceOf", args: [wallet] }),
      this.earn.holdingsOn(network, wallet),
    ]);
    const vault = vaults.find((entry) => same(entry.address, action.vault));
    const saved = positions.find((entry) => same(entry.vault.address, action.vault))?.assets ?? ZERO;
    const liquidity = vault ? usdcUnits(vault.available) : ZERO;
    const withdrawable = saved < liquidity ? saved : liquidity;
    const plan = planSave({ balance, withdrawable, keep: BigInt(action.keep), topUp: action.topUp });
    return { vault, balance, saved, withdrawable, plan };
  }

  // ── Reading ─────────────────────────────────────────────────────────────────────────────────────────────────

  private async own(userId: string, id: string): Promise<AutomationRow> {
    const [row] = await this.db
      .select()
      .from(automations)
      .where(and(eq(automations.id, id), eq(automations.userId, userId)));
    if (!row) throw problem(HTTP.notFound, "not_found", "no such automation");
    return row;
  }

  async view(row: AutomationRow): Promise<AutomationView> {
    const explorer = this.chains.get(row.network)?.network.viemChain.blockExplorers?.default.url;
    const [grant] = row.grantId ? await this.db.select().from(grants).where(eq(grants.id, row.grantId)) : [];
    const runs = await this.db
      .select({ run: automationRuns, txHash: txAttempts.txHash })
      .from(automationRuns)
      .leftJoin(txAttempts, eq(txAttempts.intentId, automationRuns.intentId))
      .where(and(eq(automationRuns.automationId, row.id), or(isNull(automationRuns.reason), ne(automationRuns.reason, NOTHING_TO_MOVE))))
      .orderBy(desc(automationRuns.scheduledFor))
      .limit(RUNS_SHOWN);
    const report = row.report as StoredDraft | null;
    const live = row.status === "draft" || row.status === "active";
    const upcoming = live && row.kind !== "rule" ? (row.status === "active" && row.nextRunAt ? [row.nextRunAt, ...nextRuns(row.schedule, row.nextRunAt, NEXT_RUNS_SHOWN - 1)] : nextRuns(row.schedule, new Date(), NEXT_RUNS_SHOWN)) : [];
    const send = row.kind === "scheduled_send" ? (row.action as AutomationAction) : null;
    const payroll = row.kind === "payroll" ? (row.action as PayrollAction) : null;
    const dca = row.kind === "dca" ? (row.action as DcaAction) : null;
    const ruleSend = row.kind === "rule" && (row.action as RuleAction).step.type === "send" ? ((row.action as RuleAction).step as { capPerDay: string }) : null;
    const attention = runs.length
      ? await this.db
          .select({ id: attentionItems.id, runId: attentionItems.runId })
          .from(attentionItems)
          .where(inArray(attentionItems.runId, runs.map(({ run }) => run.id)))
      : [];
    const practiced = runs.some(({ run }) => run.status === "practiced")
      ? await this.db
          .select({ runId: sql<string>`${practiceRuns.summary}->>'runId'`, result: practiceRuns.result })
          .from(practiceRuns)
          .where(eq(practiceRuns.automationId, row.id))
      : [];
    return {
      id: row.id,
      network: row.network,
      status: row.status,
      kind: row.kind,
      practice: row.practice,
      payroll: payroll ? { lines: payroll.lines.map((line) => ({ ...line, recipientAddress: line.recipientAddress || null })), note: payroll.note } : null,
      dca,
      schedule: row.schedule,
      save: row.kind === "auto_save" ? await this.saveView(row) : null,
      rule: row.kind === "rule" ? await this.ruleView(row) : null,
      action: send
        ? {
            recipientWords: send.recipientWords,
            recipientAddress: send.recipientAddress || null,
            recipientName: send.recipientName,
            asset: send.asset,
            amount: send.amount,
            note: send.note,
          }
        : null,
      nextRuns: upcoming.map((date) => date.toISOString()),
      maxPerPeriod: send?.amount ?? ruleSend?.capPerDay ?? "0",
      periodSeconds: schedulePeriodSeconds(row.schedule),
      endsAt: row.endsAt.toISOString(),
      grant: grant ? { id: grant.id, status: grant.status, expiresAt: grant.expiresAt.toISOString() } : null,
      runs: runs.map(({ run, txHash }): AutomationRunView => ({
        id: run.id,
        scheduledFor: run.scheduledFor.toISOString(),
        status: run.status,
        reason: run.reason,
        reasonParams: run.reasonParams ?? null,
        move: run.move ?? null,
        trigger: run.trigger ?? null,
        tx: txHash && explorer ? { hash: txHash, explorerUrl: `${explorer}/tx/${txHash}` } : null,
        practice: (() => {
          const found = practiced.find((entry) => entry.runId === run.id)?.result;
          return found ? { ok: found.ok, error: found.error } : null;
        })(),
        needsYouId: attention.find((entry) => entry.runId === run.id)?.id ?? null,
      })),
      results: report?.results ?? [],
      blocking: row.status === "draft" ? (report?.blocking ?? null) : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async saveView(row: AutomationRow): Promise<AutoSaveView> {
    const action = row.action as AutoSaveAction;
    const wallet = (await this.wallets.userWallet(row.userId))?.address as Address | undefined;
    const facts = wallet && action.vault ? await this.saveFacts(row.network, wallet, action).catch(() => undefined) : undefined;
    const ended = row.status === "canceled" || row.status === "ended";
    return {
      vault: action.vault,
      vaultName: facts?.vault?.name ?? action.vaultName,
      protocol: facts?.vault?.protocol ?? "morpho",
      apy: facts?.vault?.apy ?? 0,
      keep: action.keep,
      topUp: action.topUp,
      saved: (facts?.saved ?? ZERO).toString(),
      now: ended ? null : (facts?.plan ?? null),
    };
  }

  async get(userId: string, id: string) {
    return this.view(await this.own(userId, id));
  }

  async list(user: SessionUser) {
    const rows = await this.db
      .select()
      .from(automations)
      .where(and(eq(automations.userId, user.id), eq(automations.network, user.activeNetwork), inArray(automations.status, ["active", "paused", "draft"])))
      .orderBy(desc(automations.createdAt));
    // Drafts nobody turned on stay out of the list after a day; they live on in the chat card.
    const fresh = rows.filter((row) => row.status !== "draft" || row.createdAt.getTime() > Date.now() - SECONDS_PER_DAY * MS_PER_SECOND);
    return Promise.all(fresh.map((row) => this.view(row)));
  }

  // ── Turning on ──────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * The grants to sign. A scheduled send: one — `token.transfer(recipient, …)` only, at most `amount` per period,
   * until the automation ends. Auto-save: three — approve the vault, deposit for the wallet, withdraw to the wallet —
   * so Kawase can only move USDC between the wallet and its own position. One Face ID signs them all.
   */
  async grantRequest(user: SessionUser, id: string): Promise<AutomationGrantRequest> {
    const row = await this.own(user.id, id);
    // A draft, or a practice automation going live.
    if (row.status !== "draft" && !(row.practice && row.status === "active")) throw problem(HTTP.conflict, "intent_final");
    if ((row.report as StoredDraft | null)?.blocking) throw problem(HTTP.unprocessable, "intent_blocked");
    const wallet = await this.wallets.userWallet(user.id);
    if (!wallet) throw problem(HTTP.unprocessable, "wallet_not_registered");
    const { client, network: context, ops } = this.clients(row.network);
    if (!isWalletSetUp(await client.getCode({ address: wallet.address as Address }))) throw problem(HTTP.unprocessable, "wallet_not_set_up");
    const startsAt = nowSeconds();
    const expiresAt = Math.floor(row.endsAt.getTime() / MS_PER_SECOND);
    const salt = (): Hex => `0x${randomBytes(SALT_BYTES).toString("hex")}`;
    const base = {
      userId: user.id,
      network: row.network,
      kind: "automation" as const,
      automationId: row.id,
      delegatorWalletId: wallet.id,
      delegateAddress: ops.address,
      startsAt: new Date(startsAt * MS_PER_SECOND),
      expiresAt: new Date(expiresAt * MS_PER_SECOND),
      status: "pending" as const,
    };

    if (row.kind === "dca") return { grants: [], receipts: [] };
    if (row.kind === "payroll") {
      const action = row.action as PayrollAction;
      const out: AutomationGrantRequest = { grants: [], receipts: [] };
      const periodSeconds = schedulePeriodSeconds(row.schedule);
      for (const [index, line] of action.lines.entries()) {
        const amountPerPeriod = BigInt(line.amount);
        const grant = buildAutomationGrant({ network: context, wallet: wallet.address as Address, redeemer: ops.address, token: line.asset === "USDC" ? context.addresses.usdc : context.addresses.eurc, amountPerPeriod, periodSeconds, startsAt, expiresAt, salt: salt(), recipient: line.recipientAddress as Address });
        const typedData = grantTypedData(context, grant);
        const receipt = { purpose: `line:${index}`, ...describeGrant(context, grant) };
        const [inserted] = await this.db
          .insert(grants)
          .values({ ...base, delegation: jsonSafe(grant), delegationHash: hashTypedData(typedData), receipt: jsonSafe(receipt), periodAmount: amountPerPeriod, periodSeconds, recipientAddress: line.recipientAddress })
          .returning({ id: grants.id });
        out.grants.push({ grantId: inserted!.id, typedData: jsonSafe(typedData) });
        out.receipts.push(jsonSafe(receipt));
      }
      return out;
    }
    if (row.kind === "rule") {
      const action = row.action as RuleAction;
      const out: AutomationGrantRequest = { grants: [], receipts: [] };
      const store = async (purpose: string, delegation: ReturnType<typeof buildSaveGrants>["approve"]) => {
        const typedData = grantTypedData(context, delegation);
        const receipt = { purpose, ...describeGrant(context, delegation) };
        const [inserted] = await this.db
          .insert(grants)
          .values({ ...base, delegation: jsonSafe(delegation), delegationHash: hashTypedData(typedData), receipt: jsonSafe(receipt), periodAmount: ZERO, periodSeconds: 0, recipientAddress: wallet.address })
          .returning({ id: grants.id });
        out.grants.push({ grantId: inserted!.id, typedData: jsonSafe(typedData) });
        out.receipts.push(jsonSafe(receipt));
      };
      if (action.step.type === "bridge") {
        const built = buildBridgeGrants({ network: context, wallet: wallet.address as Address, redeemer: ops.address, usdc: context.addresses.usdc, bridge: bridgeContract(context), domain: action.step.domain, expiresAt, salts: { allowance: salt(), burn: salt() } });
        for (const purpose of BRIDGE_PURPOSES) await store(purpose, built[purpose]);
      } else if (action.step.type === "save") {
        const built = buildSaveGrants({ network: context, wallet: wallet.address as Address, redeemer: ops.address, usdc: context.addresses.usdc, vault: action.step.vault as Address, expiresAt, salts: { approve: salt(), deposit: salt(), withdraw: salt() } });
        for (const purpose of RULE_PURPOSES.save) await store(purpose, built[purpose]);
      } else if (action.step.type === "send") {
        // Pinned to the one person, at most the cap a day: more than that waits in Needs you.
        const step = action.step;
        const grant = buildAutomationGrant({ network: context, wallet: wallet.address as Address, redeemer: ops.address, token: step.asset === "USDC" ? context.addresses.usdc : context.addresses.eurc, amountPerPeriod: BigInt(step.capPerDay), periodSeconds: SECONDS_PER_DAY, startsAt, expiresAt, salt: salt(), recipient: step.recipientAddress as Address });
        const typedData = grantTypedData(context, grant);
        const receipt = { purpose: "send", ...describeGrant(context, grant) };
        const [inserted] = await this.db
          .insert(grants)
          .values({ ...base, delegation: jsonSafe(grant), delegationHash: hashTypedData(typedData), receipt: jsonSafe(receipt), periodAmount: BigInt(step.capPerDay), periodSeconds: SECONDS_PER_DAY, recipientAddress: step.recipientAddress })
          .returning({ id: grants.id });
        out.grants.push({ grantId: inserted!.id, typedData: jsonSafe(typedData) });
        out.receipts.push(jsonSafe(receipt));
      }
      return out;
    }

    if (row.kind === "auto_save") {
      const action = row.action as AutoSaveAction;
      const built = buildSaveGrants({
        network: context,
        wallet: wallet.address as Address,
        redeemer: ops.address,
        usdc: context.addresses.usdc,
        vault: action.vault as Address,
        expiresAt,
        salts: { approve: salt(), deposit: salt(), withdraw: salt() },
      });
      const out: AutomationGrantRequest = { grants: [], receipts: [] };
      for (const purpose of SAVE_PURPOSES) {
        const typedData = grantTypedData(context, built[purpose]);
        const receipt = { purpose, ...describeGrant(context, built[purpose]) };
        const [inserted] = await this.db
          .insert(grants)
          .values({ ...base, delegation: jsonSafe(built[purpose]), delegationHash: hashTypedData(typedData), receipt: jsonSafe(receipt), periodAmount: ZERO, periodSeconds: 0, recipientAddress: wallet.address })
          .returning({ id: grants.id });
        out.grants.push({ grantId: inserted!.id, typedData: jsonSafe(typedData) });
        out.receipts.push(jsonSafe(receipt));
      }
      return out;
    }

    const action = row.action as AutomationAction;
    const token = action.asset === "USDC" ? context.addresses.usdc : context.addresses.eurc;
    const periodSeconds = schedulePeriodSeconds(row.schedule);
    const grant = buildAutomationGrant({
      network: context,
      wallet: wallet.address as Address,
      redeemer: ops.address,
      token,
      amountPerPeriod: BigInt(action.amount),
      periodSeconds,
      startsAt,
      expiresAt,
      salt: salt(),
      recipient: action.recipientAddress as Address,
    });
    const typedData = grantTypedData(context, grant);
    const receipt = describeGrant(context, grant);
    const [inserted] = await this.db
      .insert(grants)
      .values({
        ...base,
        delegation: jsonSafe(grant),
        delegationHash: hashTypedData(typedData),
        receipt: jsonSafe(receipt),
        periodAmount: BigInt(action.amount),
        periodSeconds,
        recipientAddress: action.recipientAddress,
      })
      .returning({ id: grants.id });
    return { grants: [{ grantId: inserted!.id, typedData: jsonSafe(typedData) }], receipts: [jsonSafe(receipt)] };
  }

  /**
   * The wallet signed the grants: every signature is checked against the wallet, then the automation is on. A
   * scheduled send's first run is its next occurrence; Auto-save checks at once (saving what is above its line now).
   */
  async activate(user: SessionUser, id: string, input: { signatures: { grantId: string; signature: Hex }[] }) {
    const row = await this.own(user.id, id);
    // A draft goes live; so does a practice automation (its runs were "would have" until now).
    if (row.status !== "draft" && !(row.practice && row.status === "active")) return this.view(row);
    const ids = input.signatures.map((entry) => entry.grantId);
    const pending = ids.length
      ? await this.db
          .select()
          .from(grants)
          .where(and(inArray(grants.id, ids), eq(grants.userId, user.id), eq(grants.automationId, id), eq(grants.status, "pending")))
      : [];
    const needed =
      row.kind === "auto_save"
        ? SAVE_PURPOSES.length
        : row.kind === "rule"
          ? RULE_PURPOSES[(row.action as RuleAction).step.type].length
          : row.kind === "payroll"
            ? (row.action as PayrollAction).lines.length
            : row.kind === "dca"
              ? 0
              : 1;
    const purposes = new Set(pending.map((grant) => (grant.receipt as { purpose?: string }).purpose));
    if (pending.length !== needed || new Set(ids).size !== needed || (row.kind !== "scheduled_send" && purposes.size !== needed)) throw problem(HTTP.unprocessable, "grant_not_pending");
    // Going live from practice: the same automation, now under its grants.
    const wallet = await this.wallets.userWallet(user.id);
    if (!wallet) throw problem(HTTP.unprocessable, "wallet_not_registered");
    const { network: context } = this.clients(row.network);
    const signed: { grant: GrantRow; delegation: ReturnType<typeof withSignature> }[] = [];
    for (const grant of pending) {
      const signature = input.signatures.find((entry) => entry.grantId === grant.id)!.signature;
      const delegation = withSignature(grant.delegation as never, signature);
      const typedData = grantTypedData(context, delegation) as TypedDataDefinition;
      const valid = await verifyTypedData({ address: wallet.address as Address, ...typedData, signature }).catch(() => false);
      if (!valid) throw problem(HTTP.unprocessable, "signature_mismatch");
      signed.push({ grant, delegation });
    }
    const primary = row.kind === "auto_save" ? signed.find((entry) => (entry.grant.receipt as { purpose?: string }).purpose === "deposit") : signed[0];
    // Auto-save and balance rules look at once; a money-in rule waits for money; a scheduled send for its time.
    const eventRule = row.kind === "rule" && ["money_in", "money_out"].includes((row.action as RuleAction).trigger.type);
    const first =
      row.kind === "auto_save" || (row.kind === "rule" && !eventRule)
        ? new Date()
        : row.kind === "rule"
          ? null
          : nextRuns(row.schedule, new Date(), 1)[0];
    await this.db.transaction(async (tx) => {
      for (const entry of signed) await tx.update(grants).set({ status: "active", delegation: jsonSafe(entry.delegation) }).where(eq(grants.id, entry.grant.id));
      await tx.update(automations).set({ status: "active", practice: false, grantId: primary?.grant.id ?? null, nextRunAt: first ?? null }).where(eq(automations.id, id));
    });
    return this.get(user.id, id);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────────────────────────────────────

  async pause(user: SessionUser, id: string) {
    const row = await this.own(user.id, id);
    if (row.status === "active") await this.db.update(automations).set({ status: "paused" }).where(eq(automations.id, id));
    return this.get(user.id, id);
  }

  /** Back on: the next run is the next occurrence from now (a missed one is not made up). */
  async resume(user: SessionUser, id: string) {
    const row = await this.own(user.id, id);
    if (row.status === "paused") {
      const [next] = nextRuns(row.schedule, new Date(), 1);
      await this.db.update(automations).set({ status: "active", nextRunAt: next ?? null }).where(eq(automations.id, id));
    }
    return this.get(user.id, id);
  }

  /** Skip the next run: it is recorded as skipped on purpose, and the one after becomes next. */
  async skip(user: SessionUser, id: string) {
    const row = await this.own(user.id, id);
    if (row.status === "active" && row.nextRunAt) {
      await this.db
        .insert(automationRuns)
        .values({ automationId: id, userId: user.id, scheduledFor: row.nextRunAt, status: "skipped", reason: "SKIPPED_BY_YOU" })
        .onConflictDoNothing();
      const [next] = nextRuns(row.schedule, row.nextRunAt, 1);
      await this.db.update(automations).set({ nextRunAt: next ?? null }).where(eq(automations.id, id));
    }
    return this.get(user.id, id);
  }

  /** Stops it at once (nothing runs again); the grant is revoked on chain by the wallet signing the returned call. */
  async cancel(user: SessionUser, id: string): Promise<{ automation: AutomationView; revoke: TransactionRequestResponse | null }> {
    const row = await this.own(user.id, id);
    if (row.status !== "canceled" && row.status !== "ended") await this.db.update(automations).set({ status: "canceled", nextRunAt: null }).where(eq(automations.id, id));
    const active = await this.db
      .select({ id: grants.id })
      .from(grants)
      .where(and(eq(grants.automationId, id), eq(grants.userId, user.id), eq(grants.status, "active")));
    const revoke = (await this.wallets.revokeGrantsRequest(user.id, active.map((grant) => grant.id))) as TransactionRequestResponse | null;
    return { automation: await this.get(user.id, id), revoke };
  }

  /**
   * Practice first (cards/automate-safety.md): the draft goes on without a grant and its runs are "would have" — the
   * exact transaction dry-run on chain, or the quote a swap would get. Going live later signs the grant (activate).
   */
  async practice(user: SessionUser, id: string) {
    const row = await this.own(user.id, id);
    if (row.status !== "draft") return this.view(row);
    const blocking = (row.report as StoredDraft | null)?.blocking as PolicyResult | null | undefined;
    // Practice holds no grant, so a wallet not yet set up on this network is no reason to wait.
    if (blocking && blocking.code !== "WALLET_NOT_SET_UP") throw problem(HTTP.unprocessable, "intent_blocked");
    const eventRule = row.kind === "rule" && ["money_in", "money_out"].includes((row.action as RuleAction).trigger.type);
    const first = row.kind === "auto_save" || (row.kind === "rule" && !eventRule) ? new Date() : row.kind === "rule" ? null : nextRuns(row.schedule, new Date(), 1)[0];
    await this.db.update(automations).set({ status: "active", practice: true, nextRunAt: first ?? null }).where(eq(automations.id, id));
    return this.get(user.id, id);
  }

  /** The next runs on fresh facts, without doing anything: the first is dry-run on chain, the rest repeat its outcome. */
  async simulate(user: SessionUser, id: string): Promise<SimulationView> {
    const row = await this.own(user.id, id);
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    const { client, network: context } = this.clients(row.network);
    const times =
      row.kind === "rule"
        ? [new Date()]
        : row.status === "active" && row.nextRunAt
          ? [row.nextRunAt, ...nextRuns(row.schedule, row.nextRunAt, SIMULATED_RUNS - 1)]
          : nextRuns(row.schedule, new Date(), SIMULATED_RUNS);
    const balanceOf = (token: string) =>
      wallet ? client.readContract({ address: token as Address, abi: ERC20_BALANCE, functionName: "balanceOf", args: [wallet] }).catch(() => ZERO) : Promise.resolve(ZERO);
    const transfer = (token: string, to: string, amount: bigint) =>
      wallet ? simulateCall(client, { from: wallet, to: token as Address, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to as Address, amount] }) }) : Promise.resolve({ ok: false, error: "no wallet", simulatedAt: new Date().toISOString() });
    let first: Omit<SimulatedRun, "at">;
    if (row.kind === "scheduled_send") {
      const action = row.action as AutomationAction;
      const token = action.asset === "USDC" ? context.addresses.usdc : context.addresses.eurc;
      const chain = await transfer(token, action.recipientAddress, BigInt(action.amount));
      const short = (await balanceOf(token)) < BigInt(action.amount);
      first = { outcome: chain.ok && !short ? "would_send" : "would_skip", amount: action.amount, asset: action.asset, to: action.recipientName ?? action.recipientWords, reason: short ? "INSUFFICIENT_BALANCE" : chain.ok ? null : "CHAIN_REFUSED", chain: { ok: chain.ok, error: chain.error } };
    } else if (row.kind === "payroll") {
      const action = row.action as PayrollAction;
      const checks = await Promise.all(action.lines.map((line) => transfer(line.asset === "USDC" ? context.addresses.usdc : context.addresses.eurc, line.recipientAddress, BigInt(line.amount))));
      const ok = checks.every((entry) => entry.ok);
      const total = action.lines.filter((line) => line.asset === "USDC").reduce((sum, line) => sum + BigInt(line.amount), ZERO);
      first = { outcome: ok ? "would_send" : "would_skip", amount: total.toString(), asset: "USDC", to: String(action.lines.length), reason: ok ? null : "CHAIN_REFUSED", chain: { ok, error: checks.find((entry) => !entry.ok)?.error ?? null } };
    } else if (row.kind === "dca") {
      const action = row.action as DcaAction;
      const quote = wallet ? await this.quoteDca(row.network, wallet, action) : undefined;
      first = { outcome: "would_ask", amount: action.amount, asset: action.symbolIn, to: action.symbolOut, reason: quote ? "SWAP_STEP" : "QUOTE_UNAVAILABLE", chain: null };
    } else if (row.kind === "auto_save") {
      const facts = wallet ? await this.saveFacts(row.network, wallet, row.action as AutoSaveAction).catch(() => undefined) : undefined;
      first = facts?.plan ? { outcome: "would_send", amount: facts.plan.amount, asset: "USDC", to: (row.action as AutoSaveAction).vaultName, reason: facts.plan.direction === "in" ? "SAVE_IN" : "SAVE_OUT", chain: null } : { outcome: "would_wait", amount: null, asset: null, to: null, reason: NOTHING_TO_MOVE, chain: null };
    } else {
      const action = row.action as RuleAction;
      const balance = await balanceOf(context.addresses.usdc);
      const quoteOut = action.trigger.type === "price" && wallet ? (await this.priceNow(row.network, wallet, action.trigger))?.estimatedOut : undefined;
      const plan = action.trigger.type === "money_in" || action.trigger.type === "money_out" ? ({ kind: "wait", rearm: false } as const) : planRule({ ...action, armed: true }, { balance, quoteOut });
      const step = action.step;
      first =
        plan.kind === "wait"
          ? { outcome: "would_wait", amount: null, asset: null, to: null, reason: NOTHING_TO_MOVE, chain: null }
          : step.type === "swap"
            ? { outcome: "would_ask", amount: plan.amount?.toString() ?? null, asset: step.symbolIn, to: step.symbolOut, reason: "SWAP_STEP", chain: null }
            : { outcome: "would_send", amount: plan.amount?.toString() ?? null, asset: step.type === "send" ? step.asset : "USDC", to: step.type === "send" ? (step.recipientName ?? step.recipientWords) : null, reason: null, chain: null };
    }
    return {
      automationId: row.id,
      network: row.network,
      runs: times.map((at, index) => ({ ...first, at: at.toISOString(), chain: index === 0 ? first.chain : null })),
    };
  }

  /**
   * Edit in place (cards/automate-safety.md): narrowing — less per run, a longer period, another time of day, a note —
   * applies at once; widening — more per run or a shorter period — gives Kawase more than the grant the person signed,
   * so it answers with a new grant to sign together with the old one's revoke, and applies only when signed.
   */
  async edit(user: SessionUser, id: string, edit: AutomationEdit): Promise<AutomationEditResponse> {
    const row = await this.own(user.id, id);
    if (row.status === "canceled" || row.status === "ended") throw problem(HTTP.conflict, "intent_final");
    if (row.kind === "auto_save" || row.kind === "rule") throw problem(HTTP.unprocessable, "validation", "this automation is edited by asking for a new one");
    const merged = {
      every: edit.every ?? row.schedule.every,
      weekday: edit.weekday ?? row.schedule.weekday,
      monthday: edit.monthday ?? row.schedule.monthday,
      time: edit.time ?? row.schedule.time,
      timezone: edit.timezone ?? row.schedule.timezone,
    };
    if (row.status === "draft") {
      // A draft is simply drafted again with the new words, on its own network.
      const request = { ...(row.request ?? {}), ...Object.fromEntries(Object.entries(edit).filter(([, value]) => value !== undefined)) };
      const drafted =
        row.kind === "payroll"
          ? await this.draftPayroll(user, row.network, request as unknown as PayrollInput)
          : row.kind === "dca"
            ? await this.draftDca(user, row.network, request as unknown as DcaInput)
            : await this.draftSend(user, row.network, request as unknown as AutomationInput);
      const [updated] = await this.db.update(automations).set({ ...drafted, request }).where(eq(automations.id, id)).returning();
      return { automation: await this.view(updated!), grant: null, revoke: null };
    }
    const { schedule, valid } = this.schedule(user, merged);
    if (!valid) throw problem(HTTP.unprocessable, "validation", "that schedule cannot be kept");
    const nextRunAt = row.status === "active" ? (nextRuns(schedule, new Date(), 1)[0] ?? null) : row.nextRunAt;
    const period = schedulePeriodSeconds(schedule);

    if (row.kind === "dca") {
      // DCA holds no grant: each run already waits for the person, so any change applies at once.
      const action = row.action as DcaAction;
      const amount = edit.amount ? parseDecimal(edit.amount, action.decimalsIn) : ({ status: "ok", baseUnits: BigInt(action.amount) } as const);
      if (amount.status !== "ok" || amount.baseUnits <= ZERO) throw problem(HTTP.unprocessable, "validation", "that amount is not valid");
      await this.db.update(automations).set({ schedule, nextRunAt, action: { ...action, amount: amount.baseUnits.toString() } }).where(eq(automations.id, id));
      return { automation: await this.get(user.id, id), grant: null, revoke: null };
    }
    if (row.kind === "payroll") {
      const action = row.action as PayrollAction;
      const held = await this.db.select({ periodSeconds: grants.periodSeconds }).from(grants).where(and(eq(grants.automationId, id), eq(grants.status, "active")));
      if (edit.amount !== undefined) throw problem(HTTP.unprocessable, "validation", "change one person's amount by drafting the payroll again");
      if (!row.practice && held.some((grant) => period < grant.periodSeconds)) throw problem(HTTP.unprocessable, "validation", "a shorter period needs new grants: draft the payroll again");
      await this.db.update(automations).set({ schedule, nextRunAt, action: { ...action, note: edit.note === undefined ? action.note : edit.note?.trim() || null } }).where(eq(automations.id, id));
      return { automation: await this.get(user.id, id), grant: null, revoke: null };
    }

    const action = row.action as AutomationAction;
    const amount = edit.amount ? parseRequestAmount(edit.amount, action.asset) : ({ status: "ok", baseUnits: BigInt(action.amount) } as const);
    if (amount.status !== "ok" || amount.baseUnits <= ZERO) throw problem(HTTP.unprocessable, "validation", "that amount is not valid");
    const limits = await userLimits(this.db, user.id, row.network);
    if (amount.baseUnits > limits.perTx) throw problem(HTTP.unprocessable, "validation", "above your per-payment limit");
    const note = edit.note === undefined ? action.note : edit.note?.trim() || null;
    const [grant] = row.grantId ? await this.db.select().from(grants).where(and(eq(grants.id, row.grantId), eq(grants.status, "active"))) : [];
    const widening = !row.practice && grant !== undefined && (amount.baseUnits > grant.periodAmount || period < grant.periodSeconds);
    if (!widening) {
      await this.db
        .update(automations)
        .set({ schedule, nextRunAt, action: { ...action, amount: amount.baseUnits.toString(), note }, request: { ...(row.request ?? {}), amount: edit.amount ?? (row.request as { amount?: string } | null)?.amount, ...merged } })
        .where(eq(automations.id, id));
      return { automation: await this.get(user.id, id), grant: null, revoke: null };
    }
    // Widening: a new grant for the new terms, pinned to the same person, and the old one's revoke in the same yes.
    const wallet = await this.wallets.userWallet(user.id);
    if (!wallet) throw problem(HTTP.unprocessable, "wallet_not_registered");
    const { network: context, ops } = this.clients(row.network);
    const startsAt = nowSeconds();
    const expiresAt = Math.floor(row.endsAt.getTime() / MS_PER_SECOND);
    const built = buildAutomationGrant({ network: context, wallet: wallet.address as Address, redeemer: ops.address, token: action.asset === "USDC" ? context.addresses.usdc : context.addresses.eurc, amountPerPeriod: amount.baseUnits, periodSeconds: period, startsAt, expiresAt, salt: `0x${randomBytes(SALT_BYTES).toString("hex")}`, recipient: action.recipientAddress as Address });
    const typedData = grantTypedData(context, built);
    const receipt = { purpose: "edit", edit: { amount: amount.baseUnits.toString(), schedule, note }, ...describeGrant(context, built) };
    // An earlier unsigned edit is dropped: only the latest can be signed.
    await this.db.update(grants).set({ status: "superseded" }).where(and(eq(grants.automationId, id), eq(grants.status, "pending")));
    const [inserted] = await this.db
      .insert(grants)
      .values({
        userId: user.id,
        network: row.network,
        kind: "automation",
        automationId: id,
        delegatorWalletId: wallet.id,
        delegateAddress: ops.address,
        delegation: jsonSafe(built),
        delegationHash: hashTypedData(typedData),
        receipt: jsonSafe(receipt),
        periodAmount: amount.baseUnits,
        periodSeconds: period,
        recipientAddress: action.recipientAddress,
        startsAt: new Date(startsAt * MS_PER_SECOND),
        expiresAt: new Date(expiresAt * MS_PER_SECOND),
        status: "pending",
      })
      .returning({ id: grants.id });
    const revoke = (await this.wallets.revokeGrantsRequest(user.id, [grant.id])) as TransactionRequestResponse | null;
    return { automation: await this.view(row), grant: { grants: [{ grantId: inserted!.id, typedData: jsonSafe(typedData) }], receipts: [jsonSafe(receipt)] }, revoke };
  }

  /** The widened grant was signed: checked against the wallet, then the edit applies and the old grant stands down. */
  async editActivate(user: SessionUser, id: string, input: { signatures: { grantId: string; signature: Hex }[] }) {
    const row = await this.own(user.id, id);
    const [entry] = input.signatures;
    if (!entry || input.signatures.length !== 1) throw problem(HTTP.unprocessable, "grant_not_pending");
    const [pending] = await this.db.select().from(grants).where(and(eq(grants.id, entry.grantId), eq(grants.automationId, id), eq(grants.userId, user.id), eq(grants.status, "pending")));
    const edit = (pending?.receipt as { purpose?: string; edit?: { amount: string; schedule: AutomationSchedule; note: string | null } } | undefined)?.edit;
    if (!pending || !edit) throw problem(HTTP.unprocessable, "grant_not_pending");
    const wallet = await this.wallets.userWallet(user.id);
    if (!wallet) throw problem(HTTP.unprocessable, "wallet_not_registered");
    const { network: context } = this.clients(row.network);
    const delegation = withSignature(pending.delegation as never, entry.signature);
    const typedData = grantTypedData(context, delegation) as TypedDataDefinition;
    const valid = await verifyTypedData({ address: wallet.address as Address, ...typedData, signature: entry.signature }).catch(() => false);
    if (!valid) throw problem(HTTP.unprocessable, "signature_mismatch");
    const action = row.action as AutomationAction;
    const nextRunAt = row.status === "active" ? (nextRuns(edit.schedule, new Date(), 1)[0] ?? null) : row.nextRunAt;
    await this.db.transaction(async (tx) => {
      if (row.grantId) await tx.update(grants).set({ status: "superseded" }).where(and(eq(grants.id, row.grantId), eq(grants.status, "active")));
      await tx.update(grants).set({ status: "active", delegation: jsonSafe(delegation) }).where(eq(grants.id, pending.id));
      await tx.update(automations).set({ grantId: pending.id, schedule: edit.schedule, nextRunAt, action: { ...action, amount: edit.amount, note: edit.note } }).where(eq(automations.id, id));
    });
    return this.get(user.id, id);
  }

  /** The person's own sends that complete: each one gives every round-up rule one run (money out). */
  async queueRoundUps(sent: { userId: string; network: NetworkId; asset: AssetId; amount: bigint; intentId: string; surface: string }) {
    if (sent.asset !== "USDC" || sent.surface === "automation") return;
    const rules = await this.db
      .select({ id: automations.id, action: automations.action })
      .from(automations)
      .where(and(eq(automations.userId, sent.userId), eq(automations.network, sent.network), eq(automations.kind, "rule"), eq(automations.status, "active")));
    for (const rule of rules) {
      if ((rule.action as RuleAction).trigger.type !== "money_out") continue;
      await this.db
        .insert(automationRuns)
        .values({ automationId: rule.id, userId: sent.userId, scheduledFor: new Date(), status: "pending", intentId: randomUUID(), triggerRef: `sent:${sent.intentId}`, trigger: { sent: sent.amount.toString(), sentIntent: sent.intentId } })
        .onConflictDoNothing();
    }
  }

  /** The 24 h reminder: weekly and monthly runs are announced a day ahead, with a heads-up when the wallet is short. */
  private async remind() {
    const soon = new Date(Date.now() + REMIND_AHEAD_MS);
    const rows = await this.db
      .select()
      .from(automations)
      .where(and(eq(automations.status, "active"), eq(automations.practice, false), inArray(automations.kind, ["scheduled_send", "payroll", "dca"]), lte(automations.nextRunAt, soon), inArray(automations.network, this.chains.available)));
    for (const row of rows) {
      if (!row.nextRunAt || !REMINDED_SCHEDULES.has(row.schedule.every) || row.nextRunAt.getTime() < Date.now()) continue;
      if (row.remindedFor && row.remindedFor.getTime() === row.nextRunAt.getTime()) continue;
      const shown = this.shownFor(row);
      let short = false;
      if (row.kind === "scheduled_send") {
        const wallet = (await this.wallets.userWallet(row.userId))?.address as Address | undefined;
        const { client, network: context } = this.clients(row.network);
        const action = row.action as AutomationAction;
        const token = action.asset === "USDC" ? context.addresses.usdc : context.addresses.eurc;
        const held = wallet ? await client.readContract({ address: token, abi: ERC20_BALANCE, functionName: "balanceOf", args: [wallet] }).catch(() => undefined) : undefined;
        short = held !== undefined && held < BigInt(action.amount);
      }
      const at = row.nextRunAt;
      await this.db.transaction(async (tx) => {
        await tx.update(automations).set({ remindedFor: at }).where(eq(automations.id, row.id));
        await this.inbox.add(tx, {
          userId: row.userId,
          network: row.network,
          kind: "automation_reminder",
          params: { ...shown, at: at.toISOString(), automationKind: row.kind, ...(short ? { short: "1" } : {}) },
          dedupeKey: `automation_reminder:${row.id}:${at.toISOString()}`,
        });
      });
    }
  }

  /** What a skip, a reminder or a Needs-you item says about an automation's money: how much, of what, to whom. */
  private shownFor(row: AutomationRow, move?: AutomationMove): Record<string, string> {
    if (row.kind === "rule") {
      const step = (row.action as RuleAction).step;
      if (step.type === "send") return { amount: move?.amount ?? "0", asset: step.asset, to: step.recipientAddress, ...(step.recipientName ? { name: step.recipientName } : {}) };
      return { amount: move?.amount ?? "0", asset: "USDC", to: "", name: step.type === "bridge" ? step.destinationName : step.type === "save" ? step.vaultName : step.type === "swap" ? step.symbolOut : "" };
    }
    if (row.kind === "auto_save") return { amount: move?.amount ?? "0", asset: "USDC", to: (row.action as AutoSaveAction).vault, name: (row.action as AutoSaveAction).vaultName };
    if (row.kind === "payroll") {
      const action = row.action as PayrollAction;
      const total = action.lines.filter((line) => line.asset === "USDC").reduce((sum, line) => sum + BigInt(line.amount), ZERO);
      return { amount: total.toString(), asset: "USDC", to: "", name: action.lines.map((line) => line.recipientName ?? line.recipientWords).join(", "), people: String(action.lines.length) };
    }
    if (row.kind === "dca") {
      const action = row.action as DcaAction;
      // Not USDC/EURC in general: the words carry the symbols, the amount stays out of the shared money formatter.
      return { amount: "", asset: "", to: "", name: action.symbolOut, symbolIn: action.symbolIn, tokenAmount: formatUnits(BigInt(action.amount), action.decimalsIn) };
    }
    const action = row.action as AutomationAction;
    return { amount: action.amount, asset: action.asset, to: action.recipientAddress, ...(action.recipientName ? { name: action.recipientName } : {}) };
  }

  /** The best executable quote for a price rule's own amount, now. */
  private async priceNow(network: NetworkId, wallet: Address, trigger: Extract<RuleAction["trigger"], { type: "price" }>) {
    if (!this.market) return undefined;
    const tokenIn: MarketToken = { address: trigger.tokenIn as Address, symbol: trigger.symbolIn, decimals: trigger.decimalsIn };
    const tokenOut: MarketToken = { address: trigger.tokenOut as Address, symbol: trigger.symbolOut, decimals: trigger.decimalsOut };
    return this.market.quote(network, wallet, tokenIn, tokenOut, BigInt(trigger.amountIn));
  }

  private async quoteDca(network: NetworkId, wallet: Address, action: DcaAction) {
    if (!this.market) return undefined;
    return this.market.quote(network, wallet, { address: action.tokenIn as Address, symbol: action.symbolIn, decimals: action.decimalsIn }, { address: action.tokenOut as Address, symbol: action.symbolOut, decimals: action.decimalsOut }, BigInt(action.amount));
  }

  /** A step this automation may not take alone: it waits for the person (Needs you), told by inbox and push. */
  private async attend(row: AutomationRow, run: RunRow, reason: string, params: Record<string, string> | undefined, request: AttentionRequest) {
    if (!this.needsYou) return this.skipRun(row, run.id, reason, params);
    await this.needsYou.open({ userId: row.userId, network: row.network, automationId: row.id, runId: run.id, reason, reasonParams: params, request });
  }

  // ── Running ─────────────────────────────────────────────────────────────────────────────────────────────────
  //
  // Each occurrence is claimed once, and the claim carries the id its money intent will have (the run's operation
  // identity), committed together with the schedule's advance. The money pipelines create the intent under exactly
  // that id, so doing the run again — after a crash, a restart, or a second runner — finds it and resumes; nothing
  // is sent twice. A claimed run with no outcome and no intent after a short lease is driven again; every run ends
  // in one truthful state: succeeded, skipped (with why), or failed.

  /** One pass: settle or recover runs in flight, then claim and run every due occurrence once. */
  async tick() {
    await this.reconcileRuns();
    await this.claimPendingRuns();
    await this.needsYou?.sweep().catch((error: unknown) => this.log.warn({ err: error }, "needs-you sweep failed"));
    await this.remind().catch((error: unknown) => this.log.warn({ err: error }, "automation reminders failed"));
    const due = await this.db
      .select()
      .from(automations)
      .where(and(eq(automations.status, "active"), lte(automations.nextRunAt, new Date()), inArray(automations.network, this.chains.available)))
      .orderBy(asc(automations.nextRunAt));
    for (const row of due) await this.runOnce(row).catch((error: unknown) => this.log.warn({ err: error, automationId: row.id }, "automation run failed"));
  }

  private async runOnce(row: AutomationRow) {
    // Auto-save moves one thing at a time: while a move is in flight, the check waits (it stays due).
    if (row.kind === "auto_save") {
      const [open] = await this.db
        .select({ id: automationRuns.id })
        .from(automationRuns)
        .where(and(eq(automationRuns.automationId, row.id), eq(automationRuns.status, "executing")))
        .limit(1);
      if (open) return;
    }
    const scheduledFor = row.nextRunAt!;
    const lookAgain = row.kind === "rule" && (row.action as RuleAction).trigger.type === "price" ? PRICE_CHECK_MS : RULE_CHECK_MS;
    const [next] = row.kind === "rule" ? [new Date(Math.max(scheduledFor.getTime(), Date.now()) + lookAgain)] : nextRuns(row.schedule, scheduledFor, 1);
    const nextRunAt = next && next.getTime() <= row.endsAt.getTime() ? next : null;
    // The claim and the schedule's advance commit together. The unique (automation, time) row means a second
    // runner, or a retry, finds the occurrence taken; the advance only moves a schedule still on this occurrence.
    const claimed = await this.db.transaction(async (tx) => {
      const [run] = await tx
        .insert(automationRuns)
        .values({ automationId: row.id, userId: row.userId, scheduledFor, status: "executing", intentId: randomUUID() })
        .onConflictDoNothing()
        .returning();
      await tx
        .update(automations)
        .set({ nextRunAt, lastRunAt: scheduledFor, ...(nextRunAt ? {} : { status: "ended" as const }) })
        .where(and(eq(automations.id, row.id), eq(automations.nextRunAt, scheduledFor)));
      return run;
    });
    if (claimed) await this.drive(row, claimed);
  }

  /** Does one claimed run's work. Safe to call again for the same run: the money intent's id is the run's. */
  private async drive(row: AutomationRow, run: RunRow): Promise<void> {
    // Practice (the automation's own, or the person's practice mode): "would have", nothing moves.
    const [owner] = await this.db.select({ practice: users.practiceMode }).from(users).where(eq(users.id, row.userId));
    if (row.practice || owner?.practice) return this.drivePractice(row, run);
    if (row.kind === "auto_save") return this.driveSave(row, run);
    if (row.kind === "rule") return this.driveRule(row, run);
    if (row.kind === "payroll") return this.drivePayroll(row, run);
    if (row.kind === "dca") return this.driveDca(row, run);
    // Missed (the runner was down for longer than a period): not made up later, said plainly.
    if (run.scheduledFor.getTime() < Date.now() - schedulePeriodSeconds(row.schedule) * MS_PER_SECOND) return this.skipRun(row, run.id, "MISSED_RUN");
    const [grant] = row.grantId ? await this.db.select().from(grants).where(eq(grants.id, row.grantId)) : [];
    if (!grant || grant.status !== "active") return this.skipRun(row, run.id, "GRANT_INACTIVE");
    const action = row.action as AutomationAction;
    const outcome = await this.sends.runAutomation({
      userId: row.userId,
      network: row.network,
      intentId: run.intentId!,
      grant: { id: grant.id, delegation: grant.delegation },
      to: action.recipientAddress as Address,
      asset: action.asset,
      amount: BigInt(action.amount),
      note: action.note,
    });
    if (outcome.status === "skipped") {
      if (ATTENDED_REASONS.has(outcome.reason))
        return this.attend(row, run, outcome.reason, outcome.params, { type: "send", recipient: action.recipientWords, recipientAddress: action.recipientAddress, name: action.recipientName, asset: action.asset, amount: action.amount, note: action.note });
      return this.skipRun(row, run.id, outcome.reason, outcome.params);
    }
    if (!outcome.resumed) await this.db.update(automations).set({ runsDone: sql`${automations.runsDone} + 1` }).where(eq(automations.id, row.id));
  }

  /**
   * One payroll run: each line is its own send under its own grant, with its own intent id (fixed by the run and the
   * line), so a run driven again resumes every line and never pays one twice. A line its safety rules hold back waits
   * in Needs you; the run settles when every line it sent has an outcome.
   */
  private async drivePayroll(row: AutomationRow, run: RunRow): Promise<void> {
    if (run.scheduledFor.getTime() < Date.now() - schedulePeriodSeconds(row.schedule) * MS_PER_SECOND) return this.skipRun(row, run.id, "MISSED_RUN");
    const action = row.action as PayrollAction;
    const held = await this.db.select().from(grants).where(and(eq(grants.automationId, row.id), eq(grants.status, "active")));
    const byPurpose = new Map(held.map((grant) => [(grant.receipt as { purpose?: string }).purpose, grant]));
    const lines: Record<string, string> = { lines: String(action.lines.length) };
    let firstReason: string | undefined;
    for (const [index, line] of action.lines.entries()) {
      const grant = byPurpose.get(`line:${index}`);
      if (!grant) {
        lines[`line${index}`] = "skipped:GRANT_INACTIVE";
        firstReason ??= "GRANT_INACTIVE";
        continue;
      }
      const outcome = await this.sends.runAutomation({
        userId: row.userId,
        network: row.network,
        intentId: lineIntentId(run.intentId!, index),
        grant: { id: grant.id, delegation: grant.delegation },
        to: line.recipientAddress as Address,
        asset: line.asset,
        amount: BigInt(line.amount),
        note: action.note,
      });
      if (outcome.status !== "skipped") {
        lines[`line${index}`] = "sent";
        continue;
      }
      lines[`line${index}`] = `skipped:${outcome.reason}`;
      firstReason ??= outcome.reason;
      if (ATTENDED_REASONS.has(outcome.reason) && this.needsYou) {
        const [waiting] = await this.db
          .select({ id: attentionItems.id })
          .from(attentionItems)
          .where(and(eq(attentionItems.automationId, row.id), sql`${attentionItems.reasonParams}->>'runId' = ${run.id}`, sql`${attentionItems.reasonParams}->>'line' = ${String(index + 1)}`));
        if (!waiting)
          await this.needsYou.open({
            userId: row.userId,
            network: row.network,
            automationId: row.id,
            runId: null,
            reason: outcome.reason,
            reasonParams: { ...(outcome.params ?? {}), runId: run.id, line: String(index + 1) },
            request: { type: "send", recipient: line.recipientWords, recipientAddress: line.recipientAddress, name: line.recipientName, asset: line.asset, amount: line.amount, note: action.note },
          });
      }
    }
    await this.db.update(automationRuns).set({ trigger: lines, updatedAt: new Date() }).where(eq(automationRuns.id, run.id));
    if (!Object.values(lines).includes("sent")) return this.skipRun(row, run.id, firstReason ?? "SEND_FAILED");
  }

  /** One DCA run: a fresh quote, and the swap waits for the person (Needs you): every swap is their own yes (R5). */
  private async driveDca(row: AutomationRow, run: RunRow): Promise<void> {
    if (run.scheduledFor.getTime() < Date.now() - schedulePeriodSeconds(row.schedule) * MS_PER_SECOND) return this.skipRun(row, run.id, "MISSED_RUN");
    const action = row.action as DcaAction;
    const wallet = (await this.wallets.userWallet(row.userId))?.address as Address | undefined;
    if (!wallet) return this.skipRun(row, run.id, "WALLET_NOT_READY");
    const quote = await this.quoteDca(row.network, wallet, action);
    return this.attend(row, run, "SWAP_STEP", quote ? { quotedOut: quote.estimatedOut.toString() } : undefined, {
      type: "swap",
      tokenIn: action.tokenIn,
      tokenOut: action.tokenOut,
      symbolIn: action.symbolIn,
      symbolOut: action.symbolOut,
      decimalsIn: action.decimalsIn,
      amount: action.amount,
      quotedOut: quote?.estimatedOut.toString() ?? null,
      decimalsOut: action.decimalsOut,
    });
  }

  /**
   * A practice run: what this run would do on fresh facts, the exact transfer dry-run on chain from the person's wallet
   * (a swap: the quote it would get), recorded as "would have". Nothing moves and no grant is used.
   */
  private async drivePractice(row: AutomationRow, run: RunRow): Promise<void> {
    const wallet = (await this.wallets.userWallet(row.userId))?.address as Address | undefined;
    if (!wallet) return this.skipRun(row, run.id, "WALLET_NOT_READY");
    const { client, network: context } = this.clients(row.network);
    const tokenOf = (asset: string) => (asset === "USDC" ? context.addresses.usdc : context.addresses.eurc);
    const transfer = (token: string, to: string, amount: bigint) =>
      simulateCall(client, { from: wallet, to: token as Address, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to as Address, amount] }) });
    let summary: Record<string, string>;
    let result: PracticeResult;
    if (row.kind === "scheduled_send") {
      const action = row.action as AutomationAction;
      result = await transfer(tokenOf(action.asset), action.recipientAddress, BigInt(action.amount));
      summary = { amount: action.amount, asset: action.asset, to: action.recipientAddress, name: action.recipientName ?? action.recipientWords };
    } else if (row.kind === "payroll") {
      const action = row.action as PayrollAction;
      const checks = await Promise.all(action.lines.map((line) => transfer(tokenOf(line.asset), line.recipientAddress, BigInt(line.amount))));
      const refused = checks.find((entry) => !entry.ok);
      result = { ok: !refused, error: refused?.error ?? null, simulatedAt: new Date().toISOString() };
      summary = this.shownFor(row);
    } else if (row.kind === "dca") {
      const action = row.action as DcaAction;
      const quote = await this.quoteDca(row.network, wallet, action);
      result = { ok: Boolean(quote), error: quote ? null : "no route", simulatedAt: new Date().toISOString() };
      summary = { ...this.shownFor(row), quotedOut: quote?.estimatedOut.toString() ?? "", decimalsOut: String(action.decimalsOut) };
    } else if (row.kind === "auto_save") {
      const facts = await this.saveFacts(row.network, wallet, row.action as AutoSaveAction);
      if (!facts.plan) return this.skipRun(row, run.id, NOTHING_TO_MOVE);
      result = { ok: true, error: null, simulatedAt: new Date().toISOString() };
      summary = { ...this.shownFor(row, facts.plan), direction: facts.plan.direction };
    } else {
      const action = row.action as RuleAction;
      const evidence = run.trigger ?? {};
      const balance = await client.readContract({ address: context.addresses.usdc, abi: ERC20_BALANCE, functionName: "balanceOf", args: [wallet] });
      const quoteOut = action.trigger.type === "price" ? (await this.priceNow(row.network, wallet, action.trigger))?.estimatedOut : undefined;
      const plan = planRule(action, { balance, quoteOut, receipt: evidence.receipt ? BigInt(evidence.receipt) : undefined, sent: evidence.sent ? BigInt(evidence.sent) : undefined });
      const lineRule = action.trigger.type !== "money_in" && action.trigger.type !== "money_out";
      if (plan.kind === "wait") {
        if (plan.rearm) await this.db.update(automations).set({ action: { ...action, armed: true } }).where(eq(automations.id, row.id));
        return this.skipRun(row, run.id, NOTHING_TO_MOVE);
      }
      if (lineRule) await this.db.update(automations).set({ action: { ...action, armed: false } }).where(eq(automations.id, row.id));
      const step = action.step;
      result =
        step.type === "send" && plan.amount !== null
          ? await transfer(tokenOf(step.asset), step.recipientAddress, plan.amount)
          : { ok: true, error: null, simulatedAt: new Date().toISOString() };
      summary = { ...this.shownFor(row, plan.amount !== null ? { direction: "in", amount: plan.amount.toString() } : undefined), step: step.type };
    }
    await recordPractice(this.db, { userId: row.userId, network: row.network, kind: "automation_run", automationId: row.id, summary: { ...summary, runId: run.id }, result });
    await this.db.update(automationRuns).set({ status: "practiced", reasonParams: summary, updatedAt: new Date() }).where(eq(automationRuns.id, run.id));
    this.log.info({ automationId: row.id, runId: run.id, ok: result.ok }, "practice run");
  }

  /** One Auto-save check: look at the balance afresh and move the difference, if it is worth a move. */
  private async driveSave(row: AutomationRow, run: RunRow): Promise<void> {
    const action = row.action as AutoSaveAction;
    // A move already made for this run (an earlier attempt got that far) is followed, not planned again.
    const [made] = await this.db.select({ request: intents.request }).from(intents).where(eq(intents.id, run.intentId!));
    if (made) {
      const request = made.request as { action: "deposit" | "withdraw"; amount: string };
      const move: AutomationMove = { direction: request.action === "deposit" ? "in" : "out", amount: parseUnits(request.amount, USDC_DECIMALS).toString() };
      await this.db.update(automationRuns).set({ move }).where(eq(automationRuns.id, run.id));
      return;
    }
    const [owner] = await this.db.select({ pausedAllAt: users.pausedAllAt }).from(users).where(eq(users.id, row.userId));
    if (owner?.pausedAllAt) return this.skipRun(row, run.id, "PAUSED_ALL");
    const wallet = (await this.wallets.userWallet(row.userId))?.address as Address | undefined;
    if (!wallet) return this.skipRun(row, run.id, "WALLET_NOT_READY");
    const held = await this.db
      .select()
      .from(grants)
      .where(and(eq(grants.automationId, row.id), eq(grants.status, "active")));
    const byPurpose = new Map(held.map((grant) => [(grant.receipt as { purpose?: SavePurpose }).purpose, grant.delegation]));
    if (!SAVE_PURPOSES.every((purpose) => byPurpose.has(purpose))) return this.skipRun(row, run.id, "GRANT_INACTIVE");
    const facts = await this.saveFacts(row.network, wallet, action);
    this.log.info({ automationId: row.id, runId: run.id, balance: facts.balance.toString(), saved: facts.saved.toString(), withdrawable: facts.withdrawable.toString(), plan: facts.plan }, "auto-save check");
    if (!facts.plan) return this.skipRun(row, run.id, NOTHING_TO_MOVE);
    const outcome = await this.earn.runSave({
      userId: row.userId,
      network: row.network,
      intentId: run.intentId!,
      grants: Object.fromEntries(SAVE_PURPOSES.map((purpose) => [purpose, byPurpose.get(purpose)])) as unknown as SaveGrants,
      vault: action.vault as Address,
      direction: facts.plan.direction,
      amount: BigInt(facts.plan.amount),
    });
    if (outcome.status === "skipped") return this.skipRun(row, run.id, outcome.reason, undefined, facts.plan);
    if (outcome.resumed) return this.driveSave(row, run);
    await this.db.update(automationRuns).set({ move: facts.plan }).where(eq(automationRuns.id, run.id));
    await this.db.update(automations).set({ runsDone: sql`${automations.runsDone} + 1` }).where(eq(automations.id, row.id));
  }

  /** Runs that money arriving queued (one per matching receipt): taken once each, then driven. */
  private async claimPendingRuns() {
    const taken = await this.db.update(automationRuns).set({ status: "executing", updatedAt: new Date() }).where(eq(automationRuns.status, "pending")).returning();
    for (const run of taken) {
      const [row] = await this.db.select().from(automations).where(eq(automations.id, run.automationId));
      if (!row) continue;
      if (row.status !== "active") await this.skipRun(row, run.id, "RUN_INTERRUPTED");
      else await this.drive(row, run).catch((error: unknown) => this.log.warn({ err: error, runId: run.id }, "automation run failed"));
    }
  }

  /**
   * One rule check. The decision (fire, and how much) is recorded on the run together with disarming a balance
   * trigger, before any money moves; a run driven again carries out that recorded decision rather than deciding again.
   */
  private async driveRule(row: AutomationRow, run: RunRow): Promise<void> {
    const action = row.action as RuleAction;
    const [made] = await this.db.select({ id: intents.id }).from(intents).where(eq(intents.id, run.intentId!));
    if (made) return;
    const [owner] = await this.db.select({ pausedAllAt: users.pausedAllAt }).from(users).where(eq(users.id, row.userId));
    if (owner?.pausedAllAt) return this.skipRun(row, run.id, "PAUSED_ALL");
    const wallet = (await this.wallets.userWallet(row.userId))?.address as Address | undefined;
    if (!wallet) return this.skipRun(row, run.id, "WALLET_NOT_READY");
    const evidence = run.trigger ?? {};

    let amount: bigint | null;
    if (evidence.decided === "fire") {
      amount = evidence.amount ? BigInt(evidence.amount) : null;
    } else {
      const { client, network: context } = this.clients(row.network);
      const balance = await client.readContract({ address: context.addresses.usdc, abi: ERC20_BALANCE, functionName: "balanceOf", args: [wallet] });
      const receipt = evidence.receipt ? BigInt(evidence.receipt) : undefined;
      const sent = evidence.sent ? BigInt(evidence.sent) : undefined;
      if (receipt !== undefined && action.trigger.type === "money_in" && action.trigger.minAmount && receipt < BigInt(action.trigger.minAmount)) return this.skipRun(row, run.id, NOTHING_TO_MOVE);
      // A price is the executable quote for the rule's own amount, now (never a feed).
      const quote = action.trigger.type === "price" ? await this.priceNow(row.network, wallet, action.trigger) : undefined;
      const plan = planRule(action, { balance, receipt, sent, quoteOut: quote?.estimatedOut });
      if (plan.kind === "wait") {
        if (plan.rearm) await this.db.update(automations).set({ action: { ...action, armed: true } }).where(eq(automations.id, row.id));
        return this.skipRun(row, run.id, NOTHING_TO_MOVE);
      }
      amount = plan.amount;
      const decision = { ...evidence, balance: balance.toString(), decided: "fire", ...(amount !== null ? { amount: amount.toString() } : {}), ...(quote ? { quotedOut: quote.estimatedOut.toString() } : {}) };
      await this.db.transaction(async (tx) => {
        await tx.update(automationRuns).set({ trigger: decision, updatedAt: new Date() }).where(eq(automationRuns.id, run.id));
        if (action.trigger.type !== "money_in" && action.trigger.type !== "money_out") await tx.update(automations).set({ action: { ...action, armed: false } }).where(eq(automations.id, row.id));
      });
    }

    const step = action.step;
    if (step.type === "swap") {
      // Always the person's own yes (R5): the swap waits in Needs you with the quote that fired it.
      const trigger = action.trigger;
      const quotedOut = run.trigger?.quotedOut ?? null;
      return this.attend(row, run, trigger.type === "price" ? "PRICE_REACHED" : "SWAP_STEP", quotedOut ? { quotedOut } : undefined, {
        type: "swap",
        tokenIn: step.tokenIn,
        tokenOut: step.tokenOut,
        symbolIn: step.symbolIn,
        symbolOut: step.symbolOut,
        decimalsIn: trigger.type === "price" ? trigger.decimalsIn : USDC_DECIMALS,
        amount: (amount ?? ZERO).toString(),
        quotedOut,
        decimalsOut: trigger.type === "price" ? trigger.decimalsOut : null,
      });
    }
    if (step.type === "send") {
      const [grant] = await this.db.select().from(grants).where(and(eq(grants.automationId, row.id), eq(grants.status, "active")));
      if (!grant) return this.skipRun(row, run.id, "GRANT_INACTIVE");
      const outcome = await this.sends.runAutomation({ userId: row.userId, network: row.network, intentId: run.intentId!, grant: { id: grant.id, delegation: grant.delegation }, to: step.recipientAddress as Address, asset: step.asset, amount: amount!, note: null });
      if (outcome.status === "skipped") {
        if (action.trigger.type !== "money_in") await this.db.update(automations).set({ action: { ...action, armed: true } }).where(eq(automations.id, row.id));
        if (ATTENDED_REASONS.has(outcome.reason))
          return this.attend(row, run, outcome.reason, outcome.params, { type: "send", recipient: step.recipientWords, recipientAddress: step.recipientAddress, name: step.recipientName, asset: step.asset, amount: amount!.toString(), note: null });
        return this.skipRun(row, run.id, outcome.reason, outcome.params);
      }
      if (!outcome.resumed) await this.db.update(automations).set({ runsDone: sql`${automations.runsDone} + 1` }).where(eq(automations.id, row.id));
      return;
    }
    if (step.type === "notify") {
      const trigger = action.trigger;
      await this.inbox.add(this.db, {
        userId: row.userId,
        network: row.network,
        kind: "rule_alert",
        params:
          trigger.type === "price"
            ? { trigger: "price", symbolIn: trigger.symbolIn, symbolOut: trigger.symbolOut, amountIn: formatUnits(BigInt(trigger.amountIn), trigger.decimalsIn), quotedOut: run.trigger?.quotedOut ? formatUnits(BigInt(run.trigger.quotedOut), trigger.decimalsOut) : "" }
            : { trigger: trigger.type, threshold: "threshold" in trigger ? trigger.threshold : "0", balance: run.trigger?.balance ?? "", asset: "USDC", ...(evidence.receipt ? { amount: evidence.receipt } : {}) },
        dedupeKey: `rule_alert:${run.id}`,
      });
      await this.db.update(automationRuns).set({ status: "succeeded" }).where(eq(automationRuns.id, run.id));
      await this.db.update(automations).set({ runsDone: sql`${automations.runsDone} + 1` }).where(eq(automations.id, row.id));
      return;
    }
    const held = await this.db
      .select()
      .from(grants)
      .where(and(eq(grants.automationId, row.id), eq(grants.status, "active")));
    const byPurpose = new Map(held.map((grant) => [(grant.receipt as { purpose?: string }).purpose, grant.delegation]));
    const rearm = async () => {
      if (action.trigger.type !== "money_in" && action.trigger.type !== "money_out") await this.db.update(automations).set({ action: { ...action, armed: true } }).where(eq(automations.id, row.id));
    };
    if (!RULE_PURPOSES[step.type].every((purpose) => byPurpose.has(purpose))) {
      await rearm();
      return this.skipRun(row, run.id, "GRANT_INACTIVE");
    }
    const outcome =
      step.type === "bridge"
        ? await this.bridges.runBridge({
            userId: row.userId,
            network: row.network,
            intentId: run.intentId!,
            grants: Object.fromEntries(BRIDGE_PURPOSES.map((purpose) => [purpose, byPurpose.get(purpose)])) as unknown as BridgeGrants,
            destination: step.destination as Parameters<BridgeService["runBridge"]>[0]["destination"],
            amount: amount!,
          })
        : await this.earn.runSave({
            userId: row.userId,
            network: row.network,
            intentId: run.intentId!,
            grants: Object.fromEntries(SAVE_PURPOSES.map((purpose) => [purpose, byPurpose.get(purpose)])) as unknown as SaveGrants,
            vault: step.vault as Address,
            direction: "in",
            amount: amount!,
          });
    if (outcome.status === "skipped") {
      // The step could not go now (no quote, a fee too high): the trigger stays armed so the next check tries again.
      await rearm();
      return this.skipRun(row, run.id, outcome.reason, "params" in outcome ? (outcome.params as Record<string, string> | undefined) : undefined);
    }
    if (!outcome.resumed) await this.db.update(automations).set({ runsDone: sql`${automations.runsDone} + 1` }).where(eq(automations.id, row.id));
  }

  private async skipRun(row: AutomationRow, runId: string, reason: string, params?: Record<string, string>, move?: AutomationMove) {
    await this.db.update(automationRuns).set({ status: "skipped", reason, reasonParams: params ?? null, move: move ?? null }).where(eq(automationRuns.id, runId));
    if (row.kind !== "scheduled_send" && QUIET_REASONS.has(reason)) return;
    const shown = this.shownFor(row, move);
    await this.inbox.add(this.db, {
      userId: row.userId,
      network: row.network,
      kind: "automation_skipped",
      params: { ...shown, reason, ...(params ?? {}) },
      dedupeKey: `automation_skipped:${runId}`,
    });
    this.log.info({ automationId: row.id, runId, reason }, "automation run skipped");
  }

  /**
   * Runs in flight. One whose money intent has finished takes its outcome. One whose intent was never created — the
   * process stopped between the claim and the work — is driven again under the same id once its lease has passed
   * (a slow first attempt and the retry cannot both create it). A run from before runs carried an id cannot be
   * matched to its work, so it ends as interrupted and the person is told.
   */
  private async reconcileRuns() {
    const open = await this.db
      .select({ run: automationRuns, state: intents.state })
      .from(automationRuns)
      .leftJoin(intents, eq(intents.id, automationRuns.intentId))
      .where(eq(automationRuns.status, "executing"));
    for (const { run, state } of open) {
      try {
        // A payroll run settles when every line it sent has an outcome.
        if (run.trigger?.lines !== undefined && run.intentId) {
          await this.settlePayroll(run);
          continue;
        }
        if (state && UNCONFIRMED_STATES.has(state)) {
          // A Needs-you payment the person opened but never confirmed: not done, not failed.
          await this.db.update(automationRuns).set({ status: "skipped", reason: "NOT_COMPLETED" }).where(eq(automationRuns.id, run.id));
          continue;
        }
        if (state) {
          const failure = run.intentId && state !== "completed" && FINAL_INTENT_STATES.has(state);
          if (state === "completed") await this.db.update(automationRuns).set({ status: "succeeded" }).where(eq(automationRuns.id, run.id));
          else if (failure) {
            const [row] = await this.db.select({ kind: automations.kind }).from(automations).where(eq(automations.id, run.automationId));
            await this.db.update(automationRuns).set({ status: "failed", reason: row?.kind === "auto_save" ? "MOVE_FAILED" : "SEND_FAILED" }).where(eq(automationRuns.id, run.id));
          }
          continue;
        }
        if (run.updatedAt.getTime() > Date.now() - RUN_LEASE_MS) continue;
        const [row] = await this.db.select().from(automations).where(eq(automations.id, run.automationId));
        if (!row) continue;
        if (!run.intentId) {
          await this.skipRun(row, run.id, "RUN_INTERRUPTED");
          continue;
        }
        // Take the lease again before the work, so the next pass leaves this attempt alone.
        await this.db.update(automationRuns).set({ updatedAt: new Date() }).where(eq(automationRuns.id, run.id));
        this.log.warn({ automationId: row.id, runId: run.id }, "automation run recovered");
        if (row.status === "canceled" || row.status === "ended") await this.skipRun(row, run.id, "RUN_INTERRUPTED");
        else await this.drive(row, run);
      } catch (error) {
        this.log.warn({ err: error, runId: run.id }, "automation run reconcile failed");
      }
    }
  }

  private async settlePayroll(run: RunRow) {
    const lines = run.trigger ?? {};
    const count = Number(lines.lines);
    const sent = Array.from({ length: count }, (_, index) => index).filter((index) => lines[`line${index}`] === "sent");
    if (sent.length === 0) return;
    const ids = sent.map((index) => lineIntentId(run.intentId!, index));
    const states = await this.db.select({ id: intents.id, state: intents.state }).from(intents).where(inArray(intents.id, ids));
    if (states.length < ids.length || states.some((entry) => !FINAL_INTENT_STATES.has(entry.state))) return;
    const paid = states.filter((entry) => entry.state === "completed").length;
    await this.db
      .update(automationRuns)
      .set(paid === count ? { status: "succeeded" } : paid > 0 ? { status: "succeeded", reason: "PAYROLL_PARTIAL", reasonParams: { paid: String(paid), of: String(count) } } : { status: "failed", reason: "SEND_FAILED" })
      .where(eq(automationRuns.id, run.id));
    if (paid > 0) await this.db.update(automations).set({ runsDone: sql`${automations.runsDone} + 1` }).where(eq(automations.id, run.automationId));
  }

  start(intervalMs: number) {
    let running = false;
    const timer = setInterval(() => {
      if (running) return;
      running = true;
      void this.tick()
        .catch((error: unknown) => this.log.warn({ err: error }, "automation tick failed"))
        .finally(() => {
          running = false;
        });
    }, intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }
}

const ERC20_BALANCE = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;



/** A decimal in a token's own decimals ("12.5" → base units), or why not. */
function parseDecimal(text: string | undefined, decimals: number): AmountFacts {
  const value = text?.trim().replace(",", ".");
  if (!value) return { status: "missing" };
  if (!/^\d+(\.\d+)?$/.test(value) || (value.split(".")[1]?.length ?? 0) > decimals) return { status: "invalid" };
  return { status: "ok", baseUnits: parseUnits(value, decimals) };
}
